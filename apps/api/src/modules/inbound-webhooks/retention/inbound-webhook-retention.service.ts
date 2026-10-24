import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboundWebhooksRepository } from '../inbound-webhooks.repository';
import { STORAGE_ADAPTER } from '../files/storage.adapter';
import type { StorageAdapter } from '../files/storage.adapter';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_RETENTION_DAYS = 365;
/** A batch is one short transaction, so a large backlog never holds a long lock. */
const BATCH_SIZE = 500;

export interface RetentionCounts {
  drafts: number;
  submissions: number;
  files: number;
}

/**
 * The personal data an inbound webhook collects does not live forever:
 * drafts that ran out of time go, and submissions go once they are older
 * than INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS, with their files and the
 * drafts they came from. Uploads that no submission ever used are the file
 * sweep's job (InboundWebhookFilesService).
 */
@Injectable()
export class InboundWebhookRetentionService {
  private readonly logger = new Logger(InboundWebhookRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repository: InboundWebhooksRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly configService: ConfigService,
  ) {}

  async runCleanup(now = new Date()): Promise<RetentionCounts> {
    const drafts = await this.repository.deleteExpiredDrafts(now);
    const { submissions, files } = await this.purgeSubmissions(now);

    const counts = { drafts, submissions, files };
    this.logger.log(
      `Inbound webhook cleanup: removed ${drafts} expired drafts, ${submissions} submissions past retention and ${files} stored files`,
    );
    return counts;
  }

  /**
   * Deletes submissions past retention, oldest first, a batch at a time.
   * A batch's stored objects go before its rows, so an object that cannot be
   * deleted keeps its submission for the next run instead of leaking; the
   * run stops there rather than retrying the same rows.
   */
  private async purgeSubmissions(now: Date) {
    const cutoff = new Date(
      now.getTime() - this.retentionDays() * 24 * 60 * 60 * 1000,
    );
    let submissions = 0;
    let files = 0;

    for (;;) {
      const batch = await this.repository.findSubmissionsReceivedBefore(
        cutoff,
        BATCH_SIZE,
      );
      if (batch.length === 0) break;

      const batchFiles = await this.repository.findFilesOfSubmissions(
        batch.map((s) => s.id),
      );
      // Identical content is one object, so a key some other file row still
      // uses (another webhook's, or a newer submission's) must stay.
      const keys = [...new Set(batchFiles.map((f) => f.storageKey))];
      const stillUsed = await this.repository.findReferencedStorageKeys(
        keys,
        batchFiles.map((f) => f.id),
      );
      const failed = new Set<string>();
      let removedObjects = 0;
      for (const key of keys) {
        if (stillUsed.has(key)) continue;
        try {
          await this.storage.delete(key);
          removedObjects += 1;
        } catch (error) {
          failed.add(key);
          this.logger.warn(
            `Could not delete ${key}: ${(error as Error).message}`,
          );
        }
      }

      const blocked = new Set(
        batchFiles
          .filter((f) => failed.has(f.storageKey))
          .map((f) => f.submissionId),
      );
      const doomed = batch.filter((s) => !blocked.has(s.id));
      submissions += await this.repository.deleteSubmissions(
        doomed.map((s) => s.id),
        doomed.flatMap((s) => (s.draftId ? [s.draftId] : [])),
      );
      files += removedObjects;

      if (blocked.size > 0 || batch.length < BATCH_SIZE) break;
    }
    return { submissions, files };
  }

  /** A mistyped value must never mean "keep nothing". */
  private retentionDays(): number {
    const days = Number(
      this.configService.get(
        'INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS',
        DEFAULT_RETENTION_DAYS,
      ),
    );
    if (Number.isFinite(days) && days > 0) return days;
    this.logger.warn(
      `INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS is not a positive number; using ${DEFAULT_RETENTION_DAYS}`,
    );
    return DEFAULT_RETENTION_DAYS;
  }

  startCleanupSchedule(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runCleanup().catch((error: Error) => {
        this.logger.warn(`Inbound webhook cleanup failed: ${error.message}`);
      });
    }, CLEANUP_INTERVAL_MS);
    this.logger.log('Inbound webhook cleanup scheduled (every hour)');
  }

  stopCleanupSchedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
