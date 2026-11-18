import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    IdempotencyRepository,
    IdempotencyCleanupService,
    IdempotencyInterceptor,
  ],
  exports: [
    IdempotencyRepository,
    IdempotencyCleanupService,
    IdempotencyInterceptor,
  ],
})
export class IdempotencyModule {}
