import { describe, expect, it } from 'vitest';
import {
  normalizeAccessCatalog,
  normalizeAccessOverrides,
  normalizeAccessRoles,
  normalizeAuditLogs,
  isProjectKeyActive,
  normalizeAccessMatrix,
  normalizeAuthFailures,
  normalizeCreatedProject,
  normalizeGrowthSeries,
  normalizeMemberDetail,
  normalizeMemberList,
  normalizeProjectAccessLogs,
  normalizeProjectKeyInfo,
  normalizeRoleStats,
  normalizeServerStats,
  normalizeSyncChanges,
  normalizeSyncLogs,
  normalizeSyncStatus,
  normalizeUsage,
} from './api-normalize.js';

/**
 * These fixtures are copied from real MCID API responses. They exist because
 * the CLI was written against different field names (`discordId` vs
 * `memberId`, `name` vs `roleName`, bare arrays vs `{ logs: [] }`), which unit
 * tests with hand-written mocks did not catch. Keep them in sync with the API
 * controllers, not with the CLI's own types.
 */
describe('API response contracts', () => {
  it('maps the access catalog objects to labelled entries', () => {
    const catalog = normalizeAccessCatalog({
      resources: [
        { key: 'servers', description: 'Discord servers' },
        { key: 'members', description: 'Guild members' },
      ],
      levels: [
        { key: 'none', description: 'No access' },
        { key: 'read', description: 'Read only' },
        { key: 'write', description: 'Read and write' },
        { key: 'manage', description: 'Full control' },
      ],
    });

    expect(catalog.resources.map((r) => r.key)).toEqual(['servers', 'members']);
    expect(catalog.levels.map((l) => l.key)).toEqual(['none', 'read', 'write', 'manage']);
  });

  it('maps access role grants from id/name fields', () => {
    const roles = normalizeAccessRoles([
      {
        id: '990000000000200001',
        name: 'Executive',
        position: 1,
        root: true,
        grants: {},
      },
      {
        id: '990000000000200002',
        name: 'Lead',
        position: 2,
        root: false,
        grants: { members: 'read' },
      },
    ]);

    expect(roles).toEqual([
      {
        id: '990000000000200001',
        name: 'Executive',
        root: true,
        grants: {},
      },
      {
        id: '990000000000200002',
        name: 'Lead',
        root: false,
        grants: { members: 'read' },
      },
    ]);
  });

  it('flattens the member-overrides envelope into one row per resource', () => {
    const rows = normalizeAccessOverrides({
      members: [
        {
          memberId: '990000000000300002',
          username: 'seed_lead',
          displayName: 'Lead Seed',
          avatar: null,
          root: false,
          overrides: { members: 'write', stats: 'read' },
        },
      ],
    });

    expect(rows).toEqual([
      {
        memberId: '990000000000300002',
        username: 'seed_lead',
        resource: 'members',
        level: 'write',
        root: false,
      },
      {
        memberId: '990000000000300002',
        username: 'seed_lead',
        resource: 'stats',
        level: 'read',
        root: false,
      },
    ]);
  });

  it('maps paginated member rows and derives roles and join date', () => {
    const [member] = normalizeMemberList({
      data: [
        {
          memberId: '990000000000300002',
          username: 'seed_lead',
          globalName: 'Seed Lead',
          avatar: null,
          isClubMember: true,
          serverCount: 2,
          servers: [
            {
              serverId: '1231588159960387596',
              serverName: 'Micro Club Official',
              isMainServer: true,
              joinedAt: '2025-01-10T10:00:00.000Z',
              roleNames: ['Lead'],
            },
            {
              serverId: '990000000000100002',
              serverName: 'Micro Club Competitions',
              isMainServer: false,
              joinedAt: '2025-02-02T09:00:00.000Z',
              roleNames: ['Member'],
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    expect(member).toMatchObject({
      memberId: '990000000000300002',
      username: 'seed_lead',
      displayName: 'Seed Lead',
      isClubMember: true,
      roles: ['Lead', 'Member'],
      joinedAt: '2025-01-10T10:00:00.000Z',
      serversCount: 2,
      serverNames: ['Micro Club Official', 'Micro Club Competitions'],
    });
  });

  it('maps the flat single-member view', () => {
    const member = normalizeMemberDetail({
      memberId: '990000000000300002',
      username: 'seed_lead',
      globalName: 'Seed Lead',
      displayName: 'Lead Seed',
      avatar: null,
      isClubMember: true,
      servers: [
        {
          serverId: '1231588159960387596',
          serverName: 'Micro Club Official',
          isMainServer: true,
          joinedAt: '2025-01-10T10:00:00.000Z',
          roles: [{ id: '990000000000200002', name: 'Lead' }],
        },
      ],
    });

    expect(member.memberId).toBe('990000000000300002');
    expect(member.username).toBe('seed_lead');
    expect(member.roles).toEqual(['Lead']);
  });

  it('maps role statistics from the roles envelope', () => {
    const roles = normalizeRoleStats({
      serverId: '1231588159960387596',
      serverName: 'Micro Club Official',
      scope: 'server',
      roles: [
        {
          roleId: '990000000000200003',
          roleName: 'Member',
          memberCount: 1,
          percentage: 10,
          hierarchyLevel: 5,
          color: 3066993,
        },
      ],
      totalMembers: 10,
    });

    expect(roles).toEqual([
      {
        id: '990000000000200003',
        name: 'Member',
        memberCount: 1,
        percentage: 10,
        hierarchyLevel: 5,
        color: 3066993,
      },
    ]);
  });

  it('maps sync status and treats a missing log as never synced', () => {
    const status = normalizeSyncStatus({
      serverId: '1231588159960387596',
      lastSyncAt: null,
      status: 'never',
      membersSynced: 0,
      rolesSynced: 0,
      startedAt: '2026-10-22T23:00:00.000Z',
    });

    expect(status).toMatchObject({
      serverId: '1231588159960387596',
      status: 'never',
      lastSyncAt: null,
      membersSynced: 0,
      rolesSynced: 0,
    });
  });

  it('unwraps sync logs and sync changes instead of iterating an object', () => {
    expect(
      normalizeSyncLogs({
        total: 1,
        logs: [
          {
            id: 42,
            serverId: '1231588159960387596',
            syncType: 'full',
            status: 'success',
            membersSynced: 10,
            rolesSynced: 3,
            startedAt: '2026-10-22T23:00:00.000Z',
          },
        ],
      }),
    ).toEqual([
      {
        id: '42',
        serverId: '1231588159960387596',
        syncType: 'full',
        status: 'success',
        membersSynced: 10,
        rolesSynced: 3,
        startedAt: '2026-10-22T23:00:00.000Z',
      },
    ]);

    expect(
      normalizeSyncChanges({
        total: 1,
        changes: [
          {
            id: 7,
            syncLogId: 42,
            serverId: '1231588159960387596',
            entityType: 'member',
            entityId: '990000000000300002',
            action: 'added',
            description: 'Member seed_lead joined the server',
            createdAt: '2026-10-22T23:00:01.000Z',
          },
        ],
      }),
    ).toEqual([
      {
        entityType: 'member',
        entityId: '990000000000300002',
        action: 'added',
        description: 'Member seed_lead joined the server',
      },
    ]);
  });

  it('maps usage by project and computes the error rate', () => {
    expect(
      normalizeUsage({
        totalRequests: 500,
        byProject: [
          {
            projectId: '11111111-1111-4111-8111-111111111111',
            projectName: 'Micro Club Events',
            requests: 500,
            errors: 10,
          },
        ],
        byEndpoint: [],
        errors: { total: 10, byType: { '4xx': 10, '5xx': 0 } },
      }),
    ).toEqual([
      {
        projectId: '11111111-1111-4111-8111-111111111111',
        projectName: 'Micro Club Events',
        requests: 500,
        errors: 10,
        errorRate: 2,
      },
    ]);
  });

  it('unwraps authentication failures and audit logs', () => {
    expect(
      normalizeAuthFailures({
        failures: [
          {
            id: 44,
            timestamp: '2026-10-22T23:40:01.565Z',
            ipAddress: '127.0.0.1',
            reason: 'Invalid API key',
            attemptedActor: null,
            actorId: null,
            path: '/permissions/1231588159960387596/seed_lead',
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    ).toEqual([
      {
        timestamp: '2026-10-22T23:40:01.565Z',
        reason: 'Invalid API key',
        ipAddress: '127.0.0.1',
        target: '/permissions/1231588159960387596/seed_lead',
      },
    ]);

    expect(
      normalizeAuditLogs({
        logs: [
          {
            id: 1,
            timestamp: '2026-10-22T23:00:00.000Z',
            actorId: '1128450529710854185',
            actorName: 'ben_abdou5094',
            actionType: 'permission',
            action: 'updated',
            entityType: 'role',
            entityId: '990000000000200002',
            severity: 'info',
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    ).toEqual([
      {
        id: '1',
        timestamp: '2026-10-22T23:00:00.000Z',
        actor: 'ben_abdou5094',
        action: 'permission:updated',
        entityType: 'role',
        entity: 'role:990000000000200002',
      },
    ]);
  });

  it('unwraps the growth data series and server statistics envelope', () => {
    expect(
      normalizeGrowthSeries({
        data: [
          { date: '2026-10-21T00:00:00.000Z', count: 8, newMembers: 8 },
          { date: '2026-10-22T00:00:00.000Z', count: 10, newMembers: 2 },
        ],
        period: '30d',
        totalGrowth: 10,
        trend: 'increase',
      }),
    ).toEqual([8, 10]);

    expect(
      normalizeServerStats({
        servers: [
          {
            serverId: '1231588159960387596',
            serverName: 'Micro Club Official',
            memberCount: 10,
            activeMembers: 0,
            roleCount: 3,
            lastSync: null,
            syncStatus: 'never',
            lastSyncError: null,
            botStatus: 'offline',
          },
        ],
        totalServers: 1,
        totalMembers: 10,
      }),
    ).toEqual([
      {
        serverId: '1231588159960387596',
        serverName: 'Micro Club Official',
        memberCount: 10,
        roleCount: 3,
        syncStatus: 'never',
      },
    ]);
  });

  it('returns empty results for unexpected payloads instead of throwing', () => {
    expect(normalizeMemberList({ unexpected: true })).toEqual([]);
    expect(normalizeAccessRoles(null)).toEqual([]);
    expect(normalizeAccessOverrides({ members: null })).toEqual([]);
    expect(normalizeRoleStats('not-an-object')).toEqual([]);
    expect(normalizeSyncLogs(undefined)).toEqual([]);
    expect(normalizeSyncChanges({ changes: 'nope' })).toEqual([]);
    expect(normalizeUsage({ byProject: {} })).toEqual([]);
    expect(normalizeAuthFailures([])).toEqual([]);
    expect(normalizeAuditLogs(null)).toEqual([]);
    expect(normalizeGrowthSeries({ data: 'nope' })).toEqual([]);
    expect(normalizeServerStats({ servers: null })).toEqual([]);
  });

  it('maps the project access matrix and audit log fields', () => {
    expect(
      normalizeAccessMatrix([
        {
          projectId: '11111111-1111-4111-8111-111111111111',
          projectName: 'Micro Club Events',
          serverId: '1231588159960387596',
          serverName: 'Micro Club Official',
          operations: { READ: true, SEND_MESSAGES: true, MANAGE_WEBHOOKS: false },
          scopes: ['read_members', 'check_permissions'],
        },
      ]),
    ).toEqual([
      {
        projectId: '11111111-1111-4111-8111-111111111111',
        projectName: 'Micro Club Events',
        serverId: '1231588159960387596',
        serverName: 'Micro Club Official',
        scopes: ['read_members', 'check_permissions'],
        operations: { READ: true, SEND_MESSAGES: true, MANAGE_WEBHOOKS: false },
      },
    ]);

    expect(
      normalizeProjectAccessLogs([
        {
          id: 3,
          projectId: '41981730-d090-476c-8f8f-b908a05c2028',
          serverId: '990000000000100002',
          action: 'REVOKE',
          operationsBefore: { READ: true },
          operationsAfter: null,
          changedBy: 'dev-admin',
          changedAt: '2026-10-23T01:04:36.179Z',
        },
      ]),
    ).toEqual([
      {
        id: '3',
        timestamp: '2026-10-23T01:04:36.179Z',
        action: 'REVOKE',
        actor: 'dev-admin',
        projectId: '41981730-d090-476c-8f8f-b908a05c2028',
        serverId: '990000000000100002',
      },
    ]);
  });

  it('reads the created-project envelope and revoked key state', () => {
    const created = normalizeCreatedProject<{ id: string; name: string }>({
      apiKey: 'pk_1346671f.fake-secret-for-tests',
      project: {
        id: '41981730-d090-476c-8f8f-b908a05c2028',
        name: 'Contract Test',
        apiKeyPrefix: 'pk_1346671f',
        apiKeyCreatedAt: '2026-10-23T01:00:54.571Z',
        isActive: true,
      },
    });
    expect(created.project.name).toBe('Contract Test');
    expect(created.apiKey).toContain('pk_1346671f.');

    const revoked = normalizeProjectKeyInfo({
      projectId: '41981730-d090-476c-8f8f-b908a05c2028',
      projectName: 'Contract Test',
      apiKeyPrefix: 'pk_4818a8f4',
      apiKeyCreatedAt: '2026-10-23T01:00:55.904Z',
      apiKeyLastUsedAt: null,
      isActive: false,
    });
    expect(revoked).toEqual({
      prefix: 'pk_4818a8f4',
      active: false,
      createdAt: '2026-10-23T01:00:55.904Z',
    });
    expect(isProjectKeyActive({ isActive: true })).toBe(true);
    expect(isProjectKeyActive({ isActive: false })).toBe(false);
    expect(isProjectKeyActive({})).toBe(true);
  });
});
