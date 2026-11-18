import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module';
import { AuditModule } from '../audit/audit.module';
import { ProjectsModule } from '../projects/projects.module';
import { ChannelsController } from './channels.controller';
import { CategoriesController } from './categories.controller';
import { ChannelsService } from './channels.service';
import { ChannelAccessGuard } from './guards/channel-access.guard';
import { ProjectThrottlerGuard } from './guards/project-throttler.guard';

@Module({
  imports: [DiscordModule, ProjectsModule, AuditModule],
  controllers: [ChannelsController, CategoriesController],
  providers: [ChannelsService, ChannelAccessGuard, ProjectThrottlerGuard],
  exports: [ChannelsService],
})
export class ChannelsModule {}
