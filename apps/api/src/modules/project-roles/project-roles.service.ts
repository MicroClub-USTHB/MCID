import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PermissionCacheService } from '../permissions/permission-cache.service';
import { ServersRepository } from '../servers/servers.repository';
import { ProjectRolesRepository } from './project-roles.repository';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { ProjectRoleResponseDto } from './dto/project-role-response.dto';
import * as schema from '../../database/entities';

@Injectable()
export class ProjectRolesService {
  private readonly logger = new Logger(ProjectRolesService.name);

  constructor(
    private readonly projectRolesRepository: ProjectRolesRepository,
    private readonly discordService: DiscordService,
    private readonly serversRepository: ServersRepository,
    private readonly permissionCache: PermissionCacheService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async createRole(
    projectId: string,
    serverId: string,
    dto: CreateProjectRoleDto,
  ): Promise<ProjectRoleResponseDto> {
    const guild = await this.discordService.getGuildById(serverId);
    if (!guild) {
      throw new NotFoundException(`Server ${serverId} not found`);
    }

    // Explicitly create role with 0 permissions
    const createdRole = await guild.roles.create({
      name: dto.name,
      color: dto.color,
      mentionable: dto.mentionable ?? false,
      permissions: 0n,
      reason: `Created by project ${projectId}`,
    });

    // Derive hierarchy level consistent with RoleSyncService
    const positions = [...guild.roles.cache.values()].map((r) => r.position);
    const maxPosition = positions.length
      ? Math.max(...positions)
      : createdRole.position;
    const hierarchyLevel = maxPosition - createdRole.position + 1;

    // Upsert role in local database
    const savedRole = await this.serversRepository.upsertRole({
      id: createdRole.id,
      serverId,
      name: createdRole.name,
      color: createdRole.color,
      hoist: createdRole.hoist,
      position: createdRole.position,
      managed: createdRole.managed,
      mentionable: createdRole.mentionable,
      permissionsBits: 0n,
      hierarchyLevel,
    });

    // Record ownership
    await this.projectRolesRepository.recordCreatedRole({
      projectId,
      roleId: createdRole.id,
      serverId,
    });

    this.auditService.logAction({
      actionType: 'role',
      action: 'project_role_created',
      entityType: 'role',
      entityId: createdRole.id,
      details: {
        projectId,
        serverId,
        roleName: createdRole.name,
      },
      severity: 'info',
    });

    return {
      id: savedRole.id,
      serverId: savedRole.serverId,
      name: savedRole.name,
      color: savedRole.color,
      mentionable: savedRole.mentionable ?? false,
      position: savedRole.position ?? 0,
      createdAt: savedRole.createdAt.toISOString(),
    };
  }

  async grantRoleToMember(
    projectId: string,
    serverId: string,
    discordId: string,
    roleId: string,
  ): Promise<void> {
    const role = await this.projectRolesRepository.findRoleById(
      serverId,
      roleId,
    );
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.assertRoleModifiableByProject(
      projectId,
      serverId,
      discordId,
      role,
    );

    await this.writeDiscordRole('addRoleToMember', serverId, discordId, roleId);

    await this.projectRolesRepository.assignRoleToMember(discordId, roleId);
    await this.permissionCache.invalidateMember(discordId);

    this.auditService.logAction({
      actionType: 'role',
      action: 'project_role_granted',
      entityType: 'role',
      entityId: roleId,
      details: { projectId, serverId, discordId, roleId },
      severity: 'info',
    });
  }

  async removeRoleFromMember(
    projectId: string,
    serverId: string,
    discordId: string,
    roleId: string,
  ): Promise<void> {
    const role = await this.projectRolesRepository.findRoleById(
      serverId,
      roleId,
    );
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.assertRoleModifiableByProject(
      projectId,
      serverId,
      discordId,
      role,
    );

    await this.writeDiscordRole(
      'removeRoleFromMember',
      serverId,
      discordId,
      roleId,
    );

    await this.projectRolesRepository.removeRoleFromMember(discordId, roleId);
    await this.permissionCache.invalidateMember(discordId);

    this.auditService.logAction({
      actionType: 'role',
      action: 'project_role_removed',
      entityType: 'role',
      entityId: roleId,
      details: { projectId, serverId, discordId, roleId },
      severity: 'info',
    });
  }

  private async assertRoleModifiableByProject(
    projectId: string,
    serverId: string,
    discordId: string,
    role: typeof schema.roles.$inferSelect,
  ): Promise<void> {
    const isOwned = await this.projectRolesRepository.isRoleCreatedByProject(
      projectId,
      role.id,
    );

    const isProtected = this.isProtectedRole(role);

    if (!isOwned || isProtected) {
      this.auditService.logAction({
        actionType: 'access',
        action: 'role_escalation_attempt',
        entityType: 'role',
        entityId: role.id,
        details: {
          projectId,
          serverId,
          discordId,
          roleId: role.id,
          reason: isProtected
            ? 'Attempted to grant or remove protected or root role'
            : 'Attempted to grant or remove a role not created by this project',
        },
        severity: 'warning',
      });

      throw new ForbiddenException(
        'Cannot grant or remove a role not created by this project or protected',
      );
    }

    // Bot hierarchy check, on the live position; fail closed without Discord.
    const guild = await this.discordService.getGuildById(serverId);
    const botMember =
      guild &&
      (guild.members.me ?? (await guild.members.fetchMe().catch(() => null)));
    if (!guild || !botMember) {
      throw new ServiceUnavailableException('Discord is unavailable');
    }
    const position =
      guild.roles.cache.get(role.id)?.position ?? role.position ?? 0;
    if (position >= botMember.roles.highest.position) {
      throw new ForbiddenException(
        'Cannot grant or remove a role positioned higher than or equal to the bot highest role',
      );
    }
  }

  /** Discord first: a rejected write is reported, never recorded as done. */
  private async writeDiscordRole(
    op: 'addRoleToMember' | 'removeRoleFromMember',
    serverId: string,
    discordId: string,
    roleId: string,
  ): Promise<void> {
    if (await this.discordService[op](serverId, discordId, roleId)) return;

    const member = await this.discordService.getGuildMember(
      serverId,
      discordId,
    );
    if (!member) {
      throw new NotFoundException('Member not found on server');
    }
    throw new BadGatewayException('Discord rejected the role change');
  }

  private isProtectedRole(role: typeof schema.roles.$inferSelect): boolean {
    const execRoleId = this.configService.get<string>(
      'discord.executiveRoleId',
    );
    const devLeadsRoleId = this.configService.get<string>(
      'discord.devLeadRoleId',
    );
    const itLeadsRoleId = this.configService.get<string>(
      'discord.itLeadRoleId',
    );

    if (
      (execRoleId && role.id === execRoleId) ||
      (devLeadsRoleId && role.id === devLeadsRoleId) ||
      (itLeadsRoleId && role.id === itLeadsRoleId)
    ) {
      return true;
    }

    if (role.isGlobal) {
      return true;
    }

    return false;
  }
}
