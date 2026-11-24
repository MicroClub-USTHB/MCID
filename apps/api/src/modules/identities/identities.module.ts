import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IdentitiesRepository } from './identities.repository';
import { IdentitiesService } from './identities.service';

/**
 * The service only. It must not import ProjectsModule: ProjectsModule imports
 * InboundWebhooksModule, which imports this module, so that would be a cycle.
 * The HTTP endpoint lives in IdentitiesApiModule.
 */
@Module({
  imports: [DatabaseModule],
  providers: [IdentitiesService, IdentitiesRepository],
  exports: [IdentitiesService],
})
export class IdentitiesModule {}
