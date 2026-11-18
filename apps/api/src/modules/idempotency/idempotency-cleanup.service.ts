import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IdempotencyRepository } from './idempotency.repository';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class IdempotencyCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IdempotencyCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly repository: IdempotencyRepository) {}

  onModuleInit(): void {
    this.startCleanupSchedule();
  }

  onModuleDestroy(): void {
    this.stopCleanupSchedule();
  }

  async runCleanup(now = new Date()): Promise<number> {
    try {
      const purged = await this.repository.deleteExpiredKeys(now);
      if (purged > 0) {
        this.logger.log(`Purged ${purged} expired idempotency keys`);
      }
      return purged;
    } catch (error) {
      this.logger.warn(
        `Failed to purge expired idempotency keys: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  startCleanupSchedule(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runCleanup().catch((err: Error) => {
        this.logger.warn(`Idempotency cleanup run failed: ${err.message}`);
      });
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  stopCleanupSchedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
