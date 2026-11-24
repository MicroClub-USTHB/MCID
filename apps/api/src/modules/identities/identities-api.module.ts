import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { IdentitiesController } from './identities.controller';
import { IdentitiesModule } from './identities.module';

/** HTTP surface for linked accounts. ProjectsModule is here for ApiKeyGuard only. */
@Module({
  imports: [ProjectsModule, IdentitiesModule],
  controllers: [IdentitiesController],
})
export class IdentitiesApiModule {}
