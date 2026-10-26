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
    // Before a byte is read: an unconfigured server must not spool uploads
    this.storage.assertReady();

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

      const mime = await sniffMime(path);
      if (!mime || !limits.accept.has(mime)) {
        throw new UnsupportedMediaTypeException(
          `${mime ? `"${mime}"` : 'This file type'} is not accepted by this webhook`,
        );
      }

      // Keyed by content: the same bytes uploaded twice are stored once.
      const storageKey = `files/${file.sha256}`;
      // Under the key's lock, so a cleanup cannot delete the object between
      // the check that it exists and the row that now depends on it.
      const row = await this.repository.withStorageKeyLock(
        storageKey,
        async (tx) => {
          await this.ensureStored(storageKey, path, file.size);
          return this.repository.insertFile(
            {
              webhookId: webhook.id,
              storageKey,
              sha256: file.sha256,
              sizeBytes: file.size,
              mime,
              originalName: file.filename?.slice(0, 512) ?? null,
              expiresAt: new Date(Date.now() + this.fileTtlHours() * 3_600_000),
            },
            tx,
          );
        },
      );
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

  private async ensureStored(
    key: string,
    path: string,
    size: number,
  ): Promise<void> {
    if (await this.storage.exists(key)) return;
    await this.storage.put(key, createReadStream(path), size);
  }

  private fileTtlHours(): number {
    const hours = Number(
      this.configService.get('INBOUND_WEBHOOK_FILE_TTL_H', 1),
    );
    if (Number.isFinite(hours) && hours > 0) return hours;
    this.logger.warn('INBOUND_WEBHOOK_FILE_TTL_H is not a positive number');
    return 1;
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
        const tap = new Transform({
          transform(chunk: Buffer, _encoding, done) {
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
            filename: info.filename,
          };
        });
        // Reject as soon as the spool fails (a full disk, say), rather than
        // waiting on a 'close' the parser may never emit.
        spooled.then(undefined, reject);
      });
      // Fail only once the spool has settled, so its file is closed before
      // the caller removes it.
      let failed = false;
      const fail = (error: Error) => {
        failed = true;
        void (spooled ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => reject(error));
      };
      parser.on('filesLimit', () =>
        fail(new BadRequestException('Send one file per request')),
      );
      parser.on('error', (error: Error) =>
        fail(new BadRequestException(`Malformed upload: ${error.message}`)),
      );
      parser.on('close', () => {
        if (failed) return;
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
   * identical content shares one object. Objects go before their rows, so a
   * failed delete leaves the row and the next sweep tries again.
   */
  async sweepExpired(): Promise<number> {
    const expired = await this.repository.findExpiredPendingFiles(new Date());
    if (expired.length === 0) return 0;

    const { failed } = await this.removeUnreferencedObjects(expired);
    const removed = await this.repository.deletePendingFiles(
      expired.filter((f) => !failed.has(f.storageKey)).map((f) => f.id),
    );
    this.logger.log(`Orphan sweep: removed ${removed} expired uploads`);
    return removed;
  }

  /**
   * Deletes the stored objects behind `files`, except those some other file
   * row still points at (identical content is one object). `failed` holds the
   * keys that could not be deleted, so the caller keeps their rows and tries
   * again later; `removed` counts the objects actually deleted.
   */
  async removeUnreferencedObjects(
    files: { id: string; storageKey: string }[],
  ): Promise<{ removed: number; failed: Set<string> }> {
    const keys = [...new Set(files.map((f) => f.storageKey))];
    const ids = files.map((f) => f.id);
    const failed = new Set<string>();
    let removed = 0;
    for (const key of keys) {
      try {
        // The check and the delete share the key's lock, so an upload of the
        // same bytes either lands first (and is seen) or waits and stores
        // the object again.
        const deleted = await this.repository.withStorageKeyLock(
          key,
          async (tx) => {
            const used = await this.repository.findReferencedStorageKeys(
              [key],
              ids,
              tx,
            );
            if (used.has(key)) return false;
            await this.storage.delete(key);
            return true;
          },
        );
        if (deleted) removed += 1;
      } catch (error) {
        failed.add(key);
        this.logger.warn(
          `Could not delete ${key}: ${(error as Error).message}`,
        );
      }
    }
    return { removed, failed };
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
