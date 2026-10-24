import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import busboy from 'busboy';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import type { IncomingHttpHeaders } from 'http';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Transform } from 'stream';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  InboundWebhookRow,
  InboundWebhooksRepository,
} from '../inbound-webhooks.repository';
import { fileLimits } from './file-limits';
import { sniffMime } from './mime-sniffer';
import { STORAGE_ADAPTER } from './storage.adapter';
import type { StorageAdapter } from './storage.adapter';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** Enough for every signature file-type reads. */
const SNIFF_BYTES = 4100;
/** Multipart framing around the file: boundaries and part headers. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export interface UploadedFile {
  fileId: string;
  sha256: string;
  size: number;
  mime: string;
  expiresAt: string;
}

/** A request body to read: the Express request, narrowed to what is used. */
type UploadRequest = Readable & { headers: IncomingHttpHeaders };

interface Spooled {
  path: string;
  sha256: string;
  size: number;
  head: Buffer;
  filename: string | undefined;
}

@Injectable()
export class InboundWebhookFilesService {
  private readonly logger = new Logger(InboundWebhookFilesService.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repository: InboundWebhooksRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Phase one of a file submission: stores one uploaded file and returns the
   * token a later submission references. The body is read as a stream and
   * capped while it arrives; the bytes wait on disk, not in memory, until the
   * type is known. The type comes from the content, never from the client.
   */
  async receive(
    webhook: InboundWebhookRow,
    req: UploadRequest,
  ): Promise<UploadedFile> {
    const limits = fileLimits(webhook.schema);
    if (!limits) {
      throw new BadRequestException('This webhook has no file fields');
    }

    const declared = Number(req.headers['content-length']);
    if (declared > limits.maxSizeBytes + MULTIPART_OVERHEAD_BYTES) {
      throw new PayloadTooLargeException(
        `Files are limited to ${limits.maxSizeBytes} bytes`,
      );
    }

    const path = join(tmpdir(), `iwf-${randomUUID()}`);
    try {
      const file = await this.spool(req, path, limits.maxSizeBytes);
      if (file.size === 0) throw new BadRequestException('The file is empty');

      const mime = await sniffMime(file.head);
      if (!mime || !limits.accept.has(mime)) {
        throw new UnsupportedMediaTypeException(
          `${mime ? `"${mime}"` : 'This file type'} is not accepted by this webhook`,
        );
      }

      // Keyed by content: the same bytes uploaded twice are stored once.
      const storageKey = `files/${file.sha256}`;
      if (!(await this.storage.exists(storageKey))) {
        await this.storage.put(storageKey, createReadStream(path), file.size);
      }

      const ttlHours = this.configService.get<number>(
        'INBOUND_WEBHOOK_FILE_TTL_H',
        1,
      );
      const row = await this.repository.insertFile({
        webhookId: webhook.id,
        storageKey,
        sha256: file.sha256,
        sizeBytes: file.size,
        mime,
        originalName: file.filename?.slice(0, 512) ?? null,
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      });
      return {
        fileId: row.id,
        sha256: row.sha256,
        size: row.sizeBytes,
        mime: row.mime,
        expiresAt: (row.expiresAt as Date).toISOString(),
      };
    } finally {
      await rm(path, { force: true });
    }
  }

  /**
   * Streams the request's single file part to `path`, hashing and counting as
   * it goes. Busboy stops the part at `maxBytes` and flags it truncated, so
   * disk use is bounded however large the sender claims the body is.
   * ponytail: the rest of an oversized body is still read and discarded;
   * destroy the socket if that bandwidth ever matters.
   */
  private spool(
    req: UploadRequest,
    path: string,
    maxBytes: number,
  ): Promise<Spooled> {
    return new Promise((resolve, reject) => {
      let parser: busboy.Busboy;
      try {
        parser = busboy({
          headers: req.headers,
          limits: { files: 1, fileSize: maxBytes },
        });
      } catch {
        reject(new BadRequestException('Expected a multipart/form-data body'));
        return;
      }

      let spooled: Promise<Spooled> | undefined;
      parser.on('file', (_field, stream, info) => {
        const hash = createHash('sha256');
        let size = 0;
        let head = Buffer.alloc(0);
        const tap = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            if (head.length < SNIFF_BYTES) {
              head = Buffer.concat([
                head,
                chunk.subarray(0, SNIFF_BYTES - head.length),
              ]);
            }
            hash.update(chunk);
            size += chunk.length;
            done(null, chunk);
          },
        });
        spooled = pipeline(stream, tap, createWriteStream(path)).then(() => {
          if ((stream as { truncated?: boolean }).truncated) {
            throw new PayloadTooLargeException(
              `Files are limited to ${maxBytes} bytes`,
            );
          }
          return {
            path,
            sha256: hash.digest('hex'),
            size,
            head,
            filename: info.filename,
          };
        });
        spooled.catch(() => undefined); // reported once, on 'close'
      });
      parser.on('filesLimit', () =>
        reject(new BadRequestException('Send one file per request')),
      );
      parser.on('error', (error: Error) =>
        reject(new BadRequestException(`Malformed upload: ${error.message}`)),
      );
      parser.on('close', () => {
        if (spooled) spooled.then(resolve, reject);
        else reject(new BadRequestException('No file in the request'));
      });
      req.pipe(parser);
    });
  }

  // ─── Orphans ────────────────────────────────────────────────────────────

  /**
   * Removes uploads that were never attached to a submission within their
   * TTL. The stored object goes too, unless another row still points at it:
   * identical content shares one object.
   * ponytail: a re-upload of the same bytes landing between the reference
   * check and the delete would lose its object; lock per key if that bites.
   */
  async sweepExpired(): Promise<number> {
    const keys = await this.repository.deleteExpiredPendingFiles(new Date());
    if (keys.length === 0) return 0;

    const unique = [...new Set(keys)];
    const stillUsed = await this.repository.findReferencedStorageKeys(unique);
    for (const key of unique) {
      if (stillUsed.has(key)) continue;
      await this.storage.delete(key).catch((error: Error) => {
        this.logger.warn(`Could not delete ${key}: ${error.message}`);
      });
    }
    this.logger.log(`Orphan sweep: removed ${keys.length} expired uploads`);
    return keys.length;
  }

  startSweepSchedule(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.sweepExpired().catch((error: Error) => {
        this.logger.warn(`Orphan sweep failed: ${error.message}`);
      });
    }, SWEEP_INTERVAL_MS);
    this.logger.log('Upload orphan sweep scheduled (every 10 min)');
  }

  stopSweepSchedule(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}
