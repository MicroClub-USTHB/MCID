import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { DiscordModule } from '../discord/discord.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProjectsModule } from '../projects/projects.module';
import { ServersModule } from '../servers/servers.module';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectRolesRepository } from './project-roles.repository';
import { ProjectRolesService } from './project-roles.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    DiscordModule,
    ServersModule,
    PermissionsModule,
    AuditModule,
    ProjectsModule,
  ],
  controllers: [ProjectRolesController],
  providers: [ProjectRolesService, ProjectRolesRepository],
  exports: [ProjectRolesService, ProjectRolesRepository],
})
export class ProjectRolesModule {}
