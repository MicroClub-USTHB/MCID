import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PermissionCacheService } from '../permissions/permission-cache.service';
import { ServersRepository } from '../servers/servers.repository';
import { ProjectRolesRepository } from './project-roles.repository';
import { ProjectRolesService } from './project-roles.service';

describe('ProjectRolesService', () => {
  let service: ProjectRolesService;
  let projectRolesRepository: {
    recordCreatedRole: jest.Mock;
    isRoleCreatedByProject: jest.Mock;
    findRoleById: jest.Mock;
    assignRoleToMember: jest.Mock;
    removeRoleFromMember: jest.Mock;
  };
  let discordService: {
    getGuildById: jest.Mock;
    getGuildMember: jest.Mock;
    addRoleToMember: jest.Mock;
    removeRoleFromMember: jest.Mock;
  };
  let serversRepository: {
    upsertRole: jest.Mock;
  };
  let permissionCache: {
    invalidateMember: jest.Mock;
  };
  let auditService: {
    logAction: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const PROJECT_ID = 'project-uuid-1';
  const SERVER_ID = '987654321098765432';
  const DISCORD_ID = '123456789012345678';
  const ROLE_ID = 'role-111';
  const EXEC_ROLE_ID = 'role-executive';

  beforeEach(async () => {
    projectRolesRepository = {
      recordCreatedRole: jest.fn(),
      isRoleCreatedByProject: jest.fn(),
      findRoleById: jest.fn(),
      assignRoleToMember: jest.fn(),
      removeRoleFromMember: jest.fn(),
    };

    discordService = {
      getGuildById: jest.fn(),
      getGuildMember: jest.fn(),
      addRoleToMember: jest.fn(),
      removeRoleFromMember: jest.fn(),
    };

    serversRepository = {
      upsertRole: jest.fn(),
    };

    permissionCache = {
      invalidateMember: jest.fn(),
    };

    auditService = {
      logAction: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'discord.executiveRoleId') return EXEC_ROLE_ID;
        if (key === 'discord.devLeadsRoleId') return 'role-dev-lead';
        if (key === 'discord.itLeadsRoleId') return 'role-it-lead';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectRolesService,
        {
          provide: ProjectRolesRepository,
          useValue: projectRolesRepository,
        },
        { provide: DiscordService, useValue: discordService },
        { provide: ServersRepository, useValue: serversRepository },
        { provide: PermissionCacheService, useValue: permissionCache },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<ProjectRolesService>(ProjectRolesService);
  });

  describe('createRole', () => {
    it('throws NotFoundException if server does not exist', async () => {
      discordService.getGuildById.mockResolvedValue(null);

      await expect(
        service.createRole(PROJECT_ID, SERVER_ID, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates role with 0 permissions, saves to database, and records project ownership', async () => {
      const mockRolesCreate = jest.fn().mockResolvedValue({
        id: 'new-role-id',
        name: 'Event Staff',
        color: 0x123456,
        hoist: false,
        position: 5,
        managed: false,
        mentionable: true,
      });

      discordService.getGuildById.mockResolvedValue({
        id: SERVER_ID,
        roles: {
          cache: new Map([['existing-role', { position: 10 }]]),
          create: mockRolesCreate,
        },
      });

      serversRepository.upsertRole.mockResolvedValue({
        id: 'new-role-id',
        serverId: SERVER_ID,
        name: 'Event Staff',
        color: 0x123456,
        mentionable: true,
        position: 5,
        createdAt: new Date('2026-11-14T00:00:00Z'),
      });

      const result = await service.createRole(PROJECT_ID, SERVER_ID, {
        name: 'Event Staff',
        color: 0x123456,
        mentionable: true,
      });

      expect(mockRolesCreate).toHaveBeenCalledWith({
        name: 'Event Staff',
        color: 0x123456,
        mentionable: true,
        permissions: 0n,
        reason: `Created by project ${PROJECT_ID}`,
      });

      expect(serversRepository.upsertRole).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-role-id',
          serverId: SERVER_ID,
          permissionsBits: 0n,
        }),
      );

      expect(projectRolesRepository.recordCreatedRole).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        roleId: 'new-role-id',
        serverId: SERVER_ID,
      });

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'role',
          action: 'project_role_created',
          severity: 'info',
        }),
      );

      expect(result.id).toBe('new-role-id');
      expect(result.name).toBe('Event Staff');
    });
  });

  describe('grantRoleToMember', () => {
    it('throws NotFoundException if role does not exist', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue(null);

      await expect(
        service.grantRoleToMember(PROJECT_ID, SERVER_ID, DISCORD_ID, ROLE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException and logs audit if role was not created by project', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue({
        id: ROLE_ID,
        serverId: SERVER_ID,
        isGlobal: false,
        position: 2,
      });
      projectRolesRepository.isRoleCreatedByProject.mockResolvedValue(false);

      await expect(
        service.grantRoleToMember(PROJECT_ID, SERVER_ID, DISCORD_ID, ROLE_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'access',
          action: 'role_escalation_attempt',
          severity: 'warning',
        }),
      );
    });

    it('throws ForbiddenException and logs audit if role is executive role', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue({
        id: EXEC_ROLE_ID,
        serverId: SERVER_ID,
        isGlobal: false,
        position: 99,
      });
      projectRolesRepository.isRoleCreatedByProject.mockResolvedValue(true);

      await expect(
        service.grantRoleToMember(
          PROJECT_ID,
          SERVER_ID,
          DISCORD_ID,
          EXEC_ROLE_ID,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'access',
          action: 'role_escalation_attempt',
          severity: 'warning',
        }),
      );
    });

    it('throws ForbiddenException if role is above or equal to bot highest role', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue({
        id: ROLE_ID,
        serverId: SERVER_ID,
        isGlobal: false,
        position: 10,
      });
      projectRolesRepository.isRoleCreatedByProject.mockResolvedValue(true);

      discordService.getGuildById.mockResolvedValue({
        members: {
          me: {
            roles: {
              highest: { position: 10 },
            },
          },
        },
      });

      await expect(
        service.grantRoleToMember(PROJECT_ID, SERVER_ID, DISCORD_ID, ROLE_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('grants role, updates DB, invalidates cache, and audits', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue({
        id: ROLE_ID,
        serverId: SERVER_ID,
        isGlobal: false,
        position: 5,
      });
      projectRolesRepository.isRoleCreatedByProject.mockResolvedValue(true);

      discordService.getGuildById.mockResolvedValue({
        members: {
          me: {
            roles: {
              highest: { position: 10 },
            },
          },
        },
      });
      discordService.addRoleToMember.mockResolvedValue(true);

      await service.grantRoleToMember(
        PROJECT_ID,
        SERVER_ID,
        DISCORD_ID,
        ROLE_ID,
      );

      expect(discordService.addRoleToMember).toHaveBeenCalledWith(
        SERVER_ID,
        DISCORD_ID,
        ROLE_ID,
      );
      expect(projectRolesRepository.assignRoleToMember).toHaveBeenCalledWith(
        DISCORD_ID,
        ROLE_ID,
      );
      expect(permissionCache.invalidateMember).toHaveBeenCalledWith(DISCORD_ID);
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'role',
          action: 'project_role_granted',
          severity: 'info',
        }),
      );
    });
  });

  describe('removeRoleFromMember', () => {
    it('throws ForbiddenException and logs audit if role not owned by project', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue({
        id: ROLE_ID,
        serverId: SERVER_ID,
        isGlobal: false,
        position: 2,
      });
      projectRolesRepository.isRoleCreatedByProject.mockResolvedValue(false);

      await expect(
        service.removeRoleFromMember(
          PROJECT_ID,
          SERVER_ID,
          DISCORD_ID,
          ROLE_ID,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'access',
          action: 'role_escalation_attempt',
          severity: 'warning',
        }),
      );
    });

    it('removes role, updates DB, invalidates cache, and audits', async () => {
      projectRolesRepository.findRoleById.mockResolvedValue({
        id: ROLE_ID,
        serverId: SERVER_ID,
        isGlobal: false,
        position: 2,
      });
      projectRolesRepository.isRoleCreatedByProject.mockResolvedValue(true);

      discordService.getGuildById.mockResolvedValue({
        members: {
          me: {
            roles: {
              highest: { position: 10 },
            },
          },
        },
      });
      discordService.removeRoleFromMember.mockResolvedValue(true);

      await service.removeRoleFromMember(
        PROJECT_ID,
        SERVER_ID,
        DISCORD_ID,
        ROLE_ID,
      );

      expect(discordService.removeRoleFromMember).toHaveBeenCalledWith(
        SERVER_ID,
        DISCORD_ID,
        ROLE_ID,
      );
      expect(projectRolesRepository.removeRoleFromMember).toHaveBeenCalledWith(
        DISCORD_ID,
        ROLE_ID,
      );
      expect(permissionCache.invalidateMember).toHaveBeenCalledWith(DISCORD_ID);
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'role',
          action: 'project_role_removed',
          severity: 'info',
        }),
      );
    });
  });
});
