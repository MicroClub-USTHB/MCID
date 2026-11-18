import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { DiscordModule } from '../discord/discord.module';
import { AuditModule } from '../audit/audit.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectThrottlerGuard } from '../channels/guards/project-throttler.guard';
import { ProjectScheduledEventsController } from './project-scheduled-events.controller';
import { ProjectScheduledEventsService } from './project-scheduled-events.service';
import { ProjectScheduledEventsRepository } from './project-scheduled-events.repository';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    DiscordModule,
    AuditModule,
    ProjectsModule,
  ],
  controllers: [ProjectScheduledEventsController],
  providers: [
    ProjectScheduledEventsService,
    ProjectScheduledEventsRepository,
    ProjectThrottlerGuard,
  ],
  exports: [ProjectScheduledEventsService, ProjectScheduledEventsRepository],
})
export class ProjectScheduledEventsModule {}
