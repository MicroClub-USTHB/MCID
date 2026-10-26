import { Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../common/redis/redis.module';
import { AuditModule } from '../audit/audit.module';

import { InboundWebhooksController } from './inbound-webhooks.controller';
import { InboundWebhookIngestController } from './inbound-webhook-ingest.controller';
import { InboundWebhookReadController } from './inbound-webhook-read.controller';
import { InboundWebhooksService } from './inbound-webhooks.service';
import { InboundWebhooksRepository } from './inbound-webhooks.repository';
import { InboundWebhookReadGuard } from './guards/inbound-webhook-read.guard';
import { InboundWebhookFilesService } from './files/inbound-webhook-files.service';
import { S3StorageAdapter } from './files/s3.storage';
import { InboundWebhookRetentionService } from './retention/inbound-webhook-retention.service';
import { STORAGE_ADAPTER } from './files/storage.adapter';

@Module({
  imports: [DatabaseModule, RedisModule, AuditModule],
  controllers: [
    InboundWebhooksController,
    InboundWebhookIngestController,
    InboundWebhookReadController,
  ],
  providers: [
    InboundWebhooksService,
    InboundWebhooksRepository,
    InboundWebhookReadGuard,
    InboundWebhookFilesService,
    InboundWebhookRetentionService,
    { provide: STORAGE_ADAPTER, useClass: S3StorageAdapter },
  ],
  exports: [InboundWebhooksService, InboundWebhooksRepository],
})
export class InboundWebhooksModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly files: InboundWebhookFilesService,
    private readonly retention: InboundWebhookRetentionService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.files.startSweepSchedule();
      this.retention.startCleanupSchedule();
    }
  }

  onModuleDestroy() {
    this.files.stopSweepSchedule();
    this.retention.stopCleanupSchedule();
  }
}
