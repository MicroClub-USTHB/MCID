import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboundWebhookFilesService } from '../files/inbound-webhook-files.service';
import { InboundWebhooksRepository } from '../inbound-webhooks.repository';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
/** A first run soon after boot, for deployments restarted more often than hourly. */
const FIRST_RUN_DELAY_MS = 60 * 1000;
const DEFAULT_RETENTION_DAYS = 365;
/** More than a century is a typo, and would overflow the Date arithmetic. */
const MAX_RETENTION_DAYS = 36_500;
/** A batch is one short transaction, so a large backlog never holds a long lock. */
const BATCH_SIZE = 500;
/**
 * An expired draft still answers 410 for a day, so a client that comes back
 * to one learns it expired instead of being told it never existed.
 */
const DRAFT_GRACE_MS = 24 * 60 * 60 * 1000;

export interface RetentionCounts {
  drafts: number;
  submissions: number;
  /** Stored objects deleted; identical content is one object. */
  objects: number;
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
  private firstRun: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly repository: InboundWebhooksRepository,
    private readonly files: InboundWebhookFilesService,
    private readonly configService: ConfigService,
  ) {}

  /** The two steps are independent: one failing must not skip the other. */
  async runCleanup(now = new Date()): Promise<RetentionCounts> {
    const counts: RetentionCounts = { drafts: 0, submissions: 0, objects: 0 };
    let failure: Error | undefined;

    try {
      counts.drafts = await this.repository.deleteExpiredDrafts(
        new Date(now.getTime() - DRAFT_GRACE_MS),
      );
    } catch (error) {
      failure = error as Error;
      this.logger.warn(`Draft cleanup failed: ${(error as Error).message}`);
    }
    try {
      Object.assign(counts, await this.purgeSubmissions(now));
    } catch (error) {
      failure ??= error as Error;
      this.logger.warn(
        `Submission retention failed: ${(error as Error).message}`,
      );
    }

    this.logger.log(
      `Inbound webhook cleanup: removed ${counts.drafts} expired drafts, ${counts.submissions} submissions past retention and ${counts.objects} stored objects`,
    );
    if (failure) throw failure;
    return counts;
  }

  /**
   * Deletes submissions past retention, oldest first, a batch at a time.
   * A batch's stored objects go before its rows, so an object that cannot be
   * deleted keeps its submission for the next run instead of leaking. Those
   * submissions are skipped for the rest of this run so they cannot hold up
   * newer ones; the run gives up once a batch's worth of them has piled up,
   * which means the store is refusing deletes, not that one file is stuck.
   */
  private async purgeSubmissions(now: Date) {
    const cutoff = new Date(
      now.getTime() - this.retentionDays() * 24 * 60 * 60 * 1000,
    );
    const skipped: string[] = [];
    let submissions = 0;
    let objects = 0;

    while (skipped.length < BATCH_SIZE) {
      const batch = await this.repository.findSubmissionsReceivedBefore(
        cutoff,
        BATCH_SIZE,
        skipped,
      );
      if (batch.length === 0) break;

      const batchFiles = await this.repository.findFilesOfSubmissions(
        batch.map((s) => s.id),
      );
      const removal = await this.files.removeUnreferencedObjects(batchFiles);
      const blocked = new Set(
        batchFiles
          .filter((f) => removal.failed.has(f.storageKey))
          .map((f) => f.submissionId as string),
      );
      skipped.push(...blocked);

      const doomed = batch.filter((s) => !blocked.has(s.id));
      submissions += await this.repository.deleteSubmissions(
        doomed.map((s) => s.id),
        doomed.flatMap((s) => (s.draftId ? [s.draftId] : [])),
      );
      objects += removal.removed;

      if (batch.length < BATCH_SIZE) break;
    }
    return { submissions, objects };
  }

  /** A mistyped value must never mean "keep nothing". */
  private retentionDays(): number {
    const days = Number(
      this.configService.get(
        'INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS',
        DEFAULT_RETENTION_DAYS,
      ),
    );
    if (Number.isFinite(days) && days > 0 && days <= MAX_RETENTION_DAYS) {
      return days;
    }
    this.logger.warn(
      `INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS must be between 1 and ${MAX_RETENTION_DAYS}; using ${DEFAULT_RETENTION_DAYS}`,
    );
    return DEFAULT_RETENTION_DAYS;
  }

  startCleanupSchedule(): void {
    if (this.timer) return;
    const run = () => {
      this.runCleanup().catch((error: Error) => {
        this.logger.warn(`Inbound webhook cleanup failed: ${error.message}`);
      });
    };
    this.timer = setInterval(run, CLEANUP_INTERVAL_MS);
    this.firstRun = setTimeout(run, FIRST_RUN_DELAY_MS);
    this.firstRun.unref();
    this.logger.log('Inbound webhook cleanup scheduled (every hour)');
  }

  stopCleanupSchedule(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
    this.timer = null;
    this.firstRun = null;
  }
}
