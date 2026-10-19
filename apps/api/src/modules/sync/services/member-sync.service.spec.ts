import { Test, TestingModule } from '@nestjs/testing';
import { MemberSyncService } from './member-sync.service';
import { MemberRepository } from '../../members/member.repository';
import { SyncLogService } from './sync-log.service';
import { PermissionCacheService } from '../../permissions/permission-cache.service';
import { ServersRepository } from '../../servers/servers.repository';
import { AdminAccessService } from '../../admin-access/admin-access.service';
import { AuditService } from '../../audit/audit.service';

const mockMemberRepo = {
  upsertMember: jest.fn(),
  upsertServerMembership: jest.fn(),
  replaceMemberRoles: jest.fn(),
  markInactiveForServer: jest.fn(),
  recordMemberDeparture: jest.fn(),
  removeMemberRolesForServer: jest.fn(),
  deleteMemberRolesByRoleId: jest.fn(),
};

const mockSyncLog = {
  recordEventChange: jest.fn(),
};

const mockPermissionCache = {
  invalidateMember: jest.fn(),
  invalidateServer: jest.fn(),
};

const mockServersRepo = {
  // Default: the guild is a registered server. Individual tests override to
  // null to exercise the "unregistered guild" skip path.
  findById: jest.fn().mockResolvedValue({ id: 'guild-1' }),
};

const mockAdminAccess = {
  isRootRole: jest.fn((id: string) => id === 'root-1'),
};

const mockAudit = { logAction: jest.fn() };

const rootGuild: any = {
  id: 'guild-1',
  roles: { cache: new Map([['root-1', { name: 'Executive' }]]) },
};

const memberWithRoles = (ids: string[]) =>
  makeGuildMember({
    roles: {
      cache: {
        keys: () => ids,
        size: ids.length,
        every: () => true,
        has: () => true,
      },
    },
  });

const makeGuildMember = (overrides: Partial<any> = {}): any => ({
  id: 'user-1',
  guild: { id: 'guild-1' },
  user: {
    id: 'user-1',
    username: 'alice',
    globalName: null,
    avatar: 'hash',
    avatarURL: () => 'https://cdn.discord/alice.png',
  },
  nickname: null,
  joinedAt: new Date(),
  roles: {
    cache: {
      keys: () => ['role-1'],
      size: 1,
      every: () => true,
      has: () => true,
    },
  },
  ...overrides,
});

describe('MemberSyncService', () => {
  let service: MemberSyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberSyncService,
        { provide: MemberRepository, useValue: mockMemberRepo },
        { provide: SyncLogService, useValue: mockSyncLog },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
        { provide: ServersRepository, useValue: mockServersRepo },
        { provide: AdminAccessService, useValue: mockAdminAccess },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(MemberSyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockServersRepo.findById.mockResolvedValue({ id: 'guild-1' });
  });

  // ── processMember ─────────────────────────────────────────────────────

  describe('processMember', () => {
    it('upserts member profile, membership, and roles', async () => {
      mockMemberRepo.upsertMember.mockResolvedValue(undefined);
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([]);

      const guild: any = { id: 'guild-1' };
      const member = makeGuildMember();
      await service.processMember(guild, member, new Date());

      expect(mockMemberRepo.upsertMember).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', username: 'alice' }),
      );
      expect(mockMemberRepo.upsertServerMembership).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 'guild-1', isActive: true }),
      );
      expect(mockMemberRepo.replaceMemberRoles).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.any(Array),
      );
    });
  });

  // ── root role auditing ────────────────────────────────────────────────

  describe('root role auditing', () => {
    beforeEach(() => {
      mockMemberRepo.upsertMember.mockResolvedValue(undefined);
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
    });

    it('records root_granted when a root role is gained', async () => {
      mockMemberRepo.replaceMemberRoles.mockResolvedValue(['everyone']);
      await service.processMember(
        rootGuild,
        memberWithRoles(['everyone', 'root-1']),
        new Date(),
      );
      expect(mockAudit.logAction).toHaveBeenCalledTimes(1);
      expect(mockAudit.logAction).toHaveBeenCalledWith({
        actionType: 'access',
        action: 'root_granted',
        entityType: 'member',
        entityId: 'user-1',
        severity: 'warning',
        details: {
          roleId: 'root-1',
          roleName: 'Executive',
          serverId: 'guild-1',
        },
      });
    });

    it('records root_revoked when a root role is lost', async () => {
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([
        'everyone',
        'root-1',
      ]);
      await service.processMember(
        rootGuild,
        memberWithRoles(['everyone']),
        new Date(),
      );
      expect(mockAudit.logAction).toHaveBeenCalledTimes(1);
      expect(mockAudit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'root_revoked' }),
      );
    });

    it('records nothing when a root role is kept or only other roles change', async () => {
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([
        'everyone',
        'root-1',
      ]);
      await service.processMember(
        rootGuild,
        memberWithRoles(['everyone', 'root-1', 'mod']),
        new Date(),
      );
      mockMemberRepo.replaceMemberRoles.mockResolvedValue(['everyone', 'mod']);
      await service.processMember(
        rootGuild,
        memberWithRoles(['everyone']),
        new Date(),
      );
      expect(mockAudit.logAction).not.toHaveBeenCalled();
    });

    it('seeds silently on a first sync (no previous roles)', async () => {
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([]);
      await service.processMember(
        rootGuild,
        memberWithRoles(['everyone', 'root-1']),
        new Date(),
      );
      expect(mockAudit.logAction).not.toHaveBeenCalled();
    });

    it('does not break the sync when auditing throws', async () => {
      mockMemberRepo.replaceMemberRoles.mockResolvedValue(['everyone']);
      mockAudit.logAction.mockImplementationOnce(() => {
        throw new Error('audit down');
      });
      await expect(
        service.processMember(
          rootGuild,
          memberWithRoles(['everyone', 'root-1']),
          new Date(),
        ),
      ).resolves.toBeUndefined();
    });

    it('audits role changes from a gateway member update', async () => {
      mockMemberRepo.replaceMemberRoles.mockResolvedValue(['everyone']);
      mockSyncLog.recordEventChange.mockResolvedValue(undefined);
      const oldMember = memberWithRoles(['everyone']);
      const newMember = memberWithRoles(['everyone', 'root-1']);
      newMember.roles.cache.every = () => false;
      newMember.guild = rootGuild;
      await service.handleMemberUpdate(oldMember, newMember);
      expect(mockAudit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'root_granted', entityId: 'user-1' }),
      );
    });
  });

  // ── handleMemberAdd ───────────────────────────────────────────────────

  describe('handleMemberAdd', () => {
    it('processes the member and records an event change', async () => {
      mockMemberRepo.upsertMember.mockResolvedValue(undefined);
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([]);
      mockSyncLog.recordEventChange.mockResolvedValue(undefined);

      await service.handleMemberAdd(makeGuildMember());
      expect(mockPermissionCache.invalidateMember).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mockSyncLog.recordEventChange).toHaveBeenCalledWith(
        'guild-1',
        'member',
        'user-1',
        'added',
        expect.stringContaining('alice'),
      );
    });
  });

  // ── handleMemberRemove ────────────────────────────────────────────────

  describe('handleMemberRemove', () => {
    it('marks membership inactive and records removal', async () => {
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
      mockMemberRepo.recordMemberDeparture.mockResolvedValue(undefined);
      mockMemberRepo.removeMemberRolesForServer.mockResolvedValue(undefined);
      mockSyncLog.recordEventChange.mockResolvedValue(undefined);

      await service.handleMemberRemove(makeGuildMember());
      expect(mockPermissionCache.invalidateMember).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mockMemberRepo.upsertServerMembership).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(mockMemberRepo.recordMemberDeparture).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
      );
      expect(mockMemberRepo.removeMemberRolesForServer).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
      );
      expect(mockSyncLog.recordEventChange).toHaveBeenCalledWith(
        'guild-1',
        'member',
        'user-1',
        'removed',
        expect.any(String),
      );
    });
  });

  // ── handleMemberUpdate ────────────────────────────────────────────────

  describe('handleMemberUpdate', () => {
    it('upserts membership and records the update', async () => {
      const base = makeGuildMember();
      mockMemberRepo.upsertMember.mockResolvedValue(undefined);
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([]);
      mockSyncLog.recordEventChange.mockResolvedValue(undefined);

      const newer = makeGuildMember({
        nickname: 'bob',
        roles: {
          cache: {
            keys: () => ['role-1', 'role-2'],
            size: 2,
            every: () => false,
            has: (id: string) => id === 'role-1' || id === 'role-2',
          },
        },
      });
      await service.handleMemberUpdate(base, newer);
      expect(mockPermissionCache.invalidateMember).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mockSyncLog.recordEventChange).toHaveBeenCalledWith(
        'guild-1',
        'member',
        'user-1',
        'updated',
        expect.any(String),
        expect.anything(),
      );
    });

    it('does not upsert profile when nothing changed', async () => {
      const same = makeGuildMember();
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
      mockSyncLog.recordEventChange.mockResolvedValue(undefined);

      await service.handleMemberUpdate(same, same);
      expect(mockMemberRepo.upsertMember).not.toHaveBeenCalled();
    });
  });

  // ── unregistered guild guard ─────────────────────────────────────────

  describe('real-time events for an unregistered guild', () => {
    beforeEach(() => mockServersRepo.findById.mockResolvedValue(undefined));

    it('handleMemberAdd is a no-op (no writes, no FK error)', async () => {
      await service.handleMemberAdd(makeGuildMember());
      expect(mockMemberRepo.upsertMember).not.toHaveBeenCalled();
      expect(mockMemberRepo.upsertServerMembership).not.toHaveBeenCalled();
      expect(mockSyncLog.recordEventChange).not.toHaveBeenCalled();
    });

    it('handleMemberRemove is a no-op', async () => {
      await service.handleMemberRemove(makeGuildMember());
      expect(mockMemberRepo.upsertServerMembership).not.toHaveBeenCalled();
      expect(mockMemberRepo.recordMemberDeparture).not.toHaveBeenCalled();
    });

    it('handleMemberUpdate is a no-op', async () => {
      const base = makeGuildMember();
      const newer = makeGuildMember({ nickname: 'bob' });
      await service.handleMemberUpdate(base, newer);
      expect(mockMemberRepo.upsertServerMembership).not.toHaveBeenCalled();
      expect(mockMemberRepo.upsertMember).not.toHaveBeenCalled();
    });

    it('the bulk syncAllMembers path is unaffected by the guard', async () => {
      // processMember is called directly by the full-sync loop; it must not
      // consult serversRepository.
      const guild: any = { id: 'guild-9' };
      await service.processMember(guild, makeGuildMember(), new Date());
      expect(mockServersRepo.findById).not.toHaveBeenCalled();
      expect(mockMemberRepo.upsertServerMembership).toHaveBeenCalled();
    });
  });

  // ── handleUserUpdate ──────────────────────────────────────────────────

  describe('handleUserUpdate', () => {
    it('upserts the member profile with new user data', async () => {
      mockMemberRepo.upsertMember.mockResolvedValue(undefined);
      const user: any = {
        id: 'u1',
        username: 'charlie',
        globalName: null,
        avatarURL: () => null,
      };
      await service.handleUserUpdate(user, user);
      expect(mockMemberRepo.upsertMember).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', username: 'charlie' }),
      );
    });
  });

  // ── syncAllMembers ────────────────────────────────────────────────────

  describe('syncAllMembers', () => {
    it('returns counts and deactivates stale members', async () => {
      const member = makeGuildMember();
      const guild: any = {
        id: 'guild-1',
        members: {
          list: jest.fn().mockResolvedValueOnce(page([member])),
        },
      };

      mockMemberRepo.upsertMember.mockResolvedValue(undefined);
      mockMemberRepo.upsertServerMembership.mockResolvedValue(undefined);
      mockMemberRepo.replaceMemberRoles.mockResolvedValue([]);
      mockMemberRepo.markInactiveForServer.mockResolvedValue(3);

      const buffer: any[] = [];
      const result = await service.syncAllMembers(guild, 1, new Date(), buffer);

      expect(result.membersSynced).toBe(1);
      expect(result.deactivatedCount).toBe(3);
      expect(mockPermissionCache.invalidateServer).toHaveBeenCalledWith(
        'guild-1',
      );
      expect(mockMemberRepo.markInactiveForServer).toHaveBeenCalled();
    });

    it('pages with `after` until a short page', async () => {
      const full = Array.from({ length: 1000 }, (_, i) =>
        makeGuildMember({ id: `m${i}` }),
      );
      const tail = makeGuildMember({ id: 'last' });
      const guild: any = {
        id: 'guild-1',
        members: {
          list: jest
            .fn()
            .mockResolvedValueOnce(page(full))
            .mockResolvedValueOnce(page([tail])),
        },
      };
      mockMemberRepo.markInactiveForServer.mockResolvedValue(0);

      const result = await service.syncAllMembers(guild, 1, new Date(), []);

      expect(result.membersSynced).toBe(1001);
      expect(guild.members.list).toHaveBeenNthCalledWith(1, {
        limit: 1000,
        after: undefined,
      });
      expect(guild.members.list).toHaveBeenNthCalledWith(2, {
        limit: 1000,
        after: 'm999',
      });
    });
  });
});

/** Minimal stand-in for a discord.js Collection page. */
function page(members: any[]) {
  const map = new Map(members.map((m) => [m.id, m]));
  return Object.assign(map, { last: () => members[members.length - 1] });
}
