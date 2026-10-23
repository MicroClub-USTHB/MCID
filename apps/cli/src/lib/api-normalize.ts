/**
 * Normalizers between the MCID HTTP API response shapes and the shapes the
 * CLI renders. The API is the source of truth; these functions are tolerant
 * of payloads that are wrapped (`{ data: [...] }`, `{ logs: [...] }`, ...) or
 * bare arrays so a server-side shape change degrades to an empty render
 * instead of a crash — and the contract tests pin the current shapes.
 */

import { ACCESS_LEVELS, ACCESS_RESOURCES } from '@mcid/contracts';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Unwraps a response that may be a bare array or an object holding the array under one of `keys`. */
export function unwrapArray<T>(response: unknown, keys: string[]): T[] {
  if (Array.isArray(response)) return response as T[];
  const record = asRecord(response);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

// ─── Access ────────────────────────────────────────────────────────────

export interface LabeledItem {
  key: string;
  description?: string | undefined;
}

function toLabeledItems(value: unknown, fallback: readonly string[]): LabeledItem[] {
  if (!Array.isArray(value)) {
    return fallback.map((key) => ({ key }));
  }
  return value.map((item) => {
    if (typeof item === 'string') return { key: item };
    const record = asRecord(item);
    return {
      key: String(record?.['key'] ?? ''),
      description: typeof record?.['description'] === 'string' ? record['description'] : undefined,
    };
  });
}

export function normalizeAccessCatalog(response: unknown): {
  levels: LabeledItem[];
  resources: LabeledItem[];
} {
  const record = asRecord(response) ?? {};
  return {
    levels: toLabeledItems(record['levels'], ACCESS_LEVELS),
    resources: toLabeledItems(record['resources'], ACCESS_RESOURCES),
  };
}

export interface NormalizedAccessRole {
  id: string;
  name: string;
  root: boolean;
  grants: Record<string, string>;
}

export function normalizeAccessRoles(response: unknown): NormalizedAccessRole[] {
  return unwrapArray<Record<string, unknown>>(response, ['roles']).map((role) => {
    const grants = asRecord(role['grants']);
    const normalizedGrants: Record<string, string> = {};
    for (const [resource, level] of Object.entries(grants ?? {})) {
      normalizedGrants[resource] = String(level);
    }
    return {
      id: String(role['id'] ?? role['roleId'] ?? ''),
      name: String(role['name'] ?? role['roleName'] ?? ''),
      root: Boolean(role['root']),
      grants: normalizedGrants,
    };
  });
}

export interface NormalizedOverride {
  memberId: string;
  username: string;
  resource: string;
  level: string;
  root: boolean;
}

export function normalizeAccessOverrides(response: unknown): NormalizedOverride[] {
  const members = unwrapArray<Record<string, unknown>>(response, ['members']);
  const flat = unwrapArray<Record<string, unknown>>(response, ['overrides', 'data']);

  // Bare flat rows already shaped like overrides.
  if (members.length === 0 && flat.length > 0) {
    return flat.map((row) => ({
      memberId: String(row['memberId'] ?? ''),
      username: String(row['username'] ?? ''),
      resource: String(row['resource'] ?? ''),
      level: String(row['level'] ?? ''),
      root: Boolean(row['root']),
    }));
  }

  return members.flatMap((member) => {
    const overrides = asRecord(member['overrides']) ?? {};
    return Object.entries(overrides).map(([resource, level]) => ({
      memberId: String(member['memberId'] ?? ''),
      username: String(member['username'] ?? ''),
      resource,
      level: String(level),
      root: Boolean(member['root']),
    }));
  });
}

// ─── Members ───────────────────────────────────────────────────────────

export interface NormalizedMember {
  memberId: string;
  username: string;
  displayName?: string | null | undefined;
  isClubMember?: boolean | undefined;
  roles: string[];
  joinedAt?: string | null | undefined;
  serversCount: number;
  serverNames: string[];
}

export function normalizeMember(member: unknown): NormalizedMember {
  const record = asRecord(member) ?? {};
  const servers = unwrapArray<Record<string, unknown>>(record['servers'], ['servers']);
  const topRoles = unwrapArray<Record<string, unknown>>(record['roles'], ['roles']);
  const roleNames = new Set<string>();
  for (const role of topRoles) {
    const name = role['name'];
    if (typeof name === 'string' && name) roleNames.add(name);
  }
  for (const server of servers) {
    for (const name of unwrapArray<string>(server['roleNames'], ['names'])) {
      if (typeof name === 'string' && name) roleNames.add(name);
    }
    for (const role of unwrapArray<Record<string, unknown>>(server['roles'], ['roles'])) {
      const name = role['name'];
      if (typeof name === 'string' && name) roleNames.add(name);
    }
  }

  const mainServer = servers.find((server) => server['isMainServer'] === true);
  const joinedAt =
    (record['joinedAt'] as string | null | undefined) ??
    (mainServer?.['joinedAt'] as string | null | undefined) ??
    (servers[0]?.['joinedAt'] as string | null | undefined) ??
    null;

  return {
    memberId: String(record['memberId'] ?? record['discordId'] ?? record['id'] ?? ''),
    username: String(record['username'] ?? ''),
    displayName:
      (record['globalName'] as string | null | undefined) ??
      (record['displayName'] as string | null | undefined) ??
      (record['nickname'] as string | null | undefined) ??
      null,
    isClubMember: typeof record['isClubMember'] === 'boolean' ? record['isClubMember'] : undefined,
    roles: [...roleNames],
    joinedAt,
    serversCount:
      typeof record['serversCount'] === 'number'
        ? record['serversCount']
        : typeof record['serverCount'] === 'number'
          ? record['serverCount']
          : servers.length,
    serverNames: servers.map((server) => String(server['serverName'] ?? server['serverId'] ?? '')),
  };
}

export function normalizeMemberList(response: unknown): NormalizedMember[] {
  return unwrapArray<unknown>(response, ['data', 'members']).map(normalizeMember);
}

export function normalizeMemberDetail(response: unknown): NormalizedMember {
  const record = asRecord(response) ?? {};
  return normalizeMember(record['member'] ?? response);
}

// ─── Roles ─────────────────────────────────────────────────────────────

export interface NormalizedRole {
  [key: string]: unknown;
  id: string;
  name: string;
  memberCount?: number;
  percentage?: number;
  color?: number | string;
  position?: number;
  hierarchyLevel?: number;
}

export function normalizeRoleStats(response: unknown): NormalizedRole[] {
  return unwrapArray<Record<string, unknown>>(response, ['roles']).map((role) => ({
    id: String(role['id'] ?? role['roleId'] ?? ''),
    name: String(role['name'] ?? role['roleName'] ?? ''),
    ...(role['memberCount'] !== undefined ? { memberCount: Number(role['memberCount']) } : {}),
    ...(role['percentage'] !== undefined ? { percentage: Number(role['percentage']) } : {}),
    ...(typeof role['color'] === 'number' || typeof role['color'] === 'string'
      ? { color: role['color'] }
      : {}),
    ...(role['position'] !== undefined ? { position: Number(role['position']) } : {}),
    ...(role['hierarchyLevel'] !== undefined
      ? { hierarchyLevel: Number(role['hierarchyLevel']) }
      : {}),
  }));
}

// ─── Sync ──────────────────────────────────────────────────────────────

export interface NormalizedSyncStatus {
  [key: string]: unknown;
  serverId: string;
  serverName?: string;
  status: string;
  lastSyncAt: string | null;
  membersSynced: number;
  rolesSynced: number;
  message?: string;
}

export function normalizeSyncStatus(response: unknown): NormalizedSyncStatus {
  const record = asRecord(response) ?? {};
  return {
    serverId: String(record['serverId'] ?? ''),
    ...(typeof record['serverName'] === 'string' ? { serverName: record['serverName'] } : {}),
    status: String(record['status'] ?? 'never'),
    lastSyncAt:
      (record['lastSyncAt'] as string | null | undefined) ??
      (record['lastSyncedAt'] as string | null | undefined) ??
      null,
    membersSynced: Number(record['membersSynced'] ?? 0),
    rolesSynced: Number(record['rolesSynced'] ?? 0),
    ...(typeof record['message'] === 'string' ? { message: record['message'] } : {}),
  };
}

export interface NormalizedSyncLog {
  id: string;
  serverId: string;
  syncType: string;
  status: string;
  startedAt: string;
  membersSynced?: number;
  rolesSynced?: number;
  message?: string;
}

export function normalizeSyncLogs(response: unknown): NormalizedSyncLog[] {
  return unwrapArray<Record<string, unknown>>(response, ['logs']).map((log) => ({
    id: String(log['id'] ?? ''),
    serverId: String(log['serverId'] ?? ''),
    syncType: String(log['syncType'] ?? ''),
    status: String(log['status'] ?? ''),
    startedAt: String(log['startedAt'] ?? ''),
    ...(log['membersSynced'] !== undefined ? { membersSynced: Number(log['membersSynced']) } : {}),
    ...(log['rolesSynced'] !== undefined ? { rolesSynced: Number(log['rolesSynced']) } : {}),
    ...(typeof log['message'] === 'string' ? { message: log['message'] } : {}),
  }));
}

export interface NormalizedSyncChange {
  [key: string]: unknown;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
}

export function normalizeSyncChanges(response: unknown): NormalizedSyncChange[] {
  return unwrapArray<Record<string, unknown>>(response, ['changes']).map((change) => ({
    entityType: String(change['entityType'] ?? ''),
    entityId: String(change['entityId'] ?? ''),
    action: String(change['action'] ?? ''),
    description: String(change['description'] ?? change['entityName'] ?? '-'),
  }));
}

// ─── Ops ───────────────────────────────────────────────────────────────

export interface NormalizedUsageRow {
  [key: string]: unknown;
  projectId: string;
  projectName: string;
  requests: number;
  errors: number;
  errorRate: number;
}

export function normalizeUsage(response: unknown): NormalizedUsageRow[] {
  const record = asRecord(response) ?? {};
  return unwrapArray<Record<string, unknown>>(record['byProject'], ['projects']).map((project) => {
    const requests = Number(project['requests'] ?? project['requestCount'] ?? 0);
    const errors = Number(project['errors'] ?? 0);
    return {
      projectId: String(project['projectId'] ?? ''),
      projectName: String(project['projectName'] ?? project['projectId'] ?? ''),
      requests,
      errors,
      errorRate: requests > 0 ? (errors / requests) * 100 : 0,
    };
  });
}

export interface NormalizedAuthFailure {
  [key: string]: unknown;
  timestamp: string;
  reason: string;
  ipAddress: string;
  target: string;
}

export function normalizeAuthFailures(response: unknown): NormalizedAuthFailure[] {
  return unwrapArray<Record<string, unknown>>(response, ['failures']).map((failure) => ({
    timestamp: String(failure['timestamp'] ?? ''),
    reason: String(failure['reason'] ?? ''),
    ipAddress: String(failure['ipAddress'] ?? failure['ip'] ?? '-'),
    target: String(
      failure['path'] ??
        failure['attemptedActor'] ??
        failure['actorId'] ??
        failure['target'] ??
        '-',
    ),
  }));
}

export interface NormalizedAuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity: string;
}

export function normalizeAuditLogs(response: unknown): NormalizedAuditLog[] {
  return unwrapArray<Record<string, unknown>>(response, ['logs']).map((log) => ({
    id: String(log['id'] ?? ''),
    timestamp: String(log['timestamp'] ?? log['createdAt'] ?? ''),
    actor: String(log['actorName'] ?? log['actorUsername'] ?? log['actorId'] ?? 'unknown'),
    action: [log['actionType'], log['action']]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .join(':'),
    entity: String(
      log['entityType']
        ? `${log['entityType']}:${log['entityId'] ?? '-'}`
        : (log['entityId'] ?? '-'),
    ),
  }));
}

export function normalizeGrowthSeries(response: unknown): number[] {
  if (Array.isArray(response)) {
    return response.map((point) => {
      const record = asRecord(point) ?? {};
      return Number(record['count'] ?? record['members'] ?? 0);
    });
  }
  const record = asRecord(response) ?? {};
  if (Array.isArray(record['values'])) {
    return (record['values'] as unknown[]).map((value) => Number(value ?? 0));
  }
  return unwrapArray<Record<string, unknown>>(record['data'], ['points']).map((point) =>
    Number(point['count'] ?? point['members'] ?? 0),
  );
}

export interface NormalizedServerStat {
  [key: string]: unknown;
  serverId: string;
  serverName: string;
  memberCount: number;
  roleCount: number;
  syncStatus: string;
}

export function normalizeServerStats(response: unknown): NormalizedServerStat[] {
  return unwrapArray<Record<string, unknown>>(response, ['servers']).map((server) => ({
    serverId: String(server['serverId'] ?? ''),
    serverName: String(server['serverName'] ?? server['serverId'] ?? ''),
    memberCount: Number(server['memberCount'] ?? 0),
    roleCount: Number(server['roleCount'] ?? 0),
    syncStatus: String(server['syncStatus'] ?? 'never'),
  }));
}

// ─── Project access ────────────────────────────────────────────────────

export interface NormalizedAccessMatrixRow {
  projectId: string;
  projectName: string;
  serverId: string;
  serverName: string;
  scopes: string[];
  operations: Record<string, boolean>;
}

export function normalizeAccessMatrix(response: unknown): NormalizedAccessMatrixRow[] {
  return unwrapArray<Record<string, unknown>>(response, ['matrix', 'data']).map((row) => {
    const operations = asRecord(row['operations']) ?? {};
    return {
      projectId: String(row['projectId'] ?? ''),
      projectName: String(row['projectName'] ?? row['projectId'] ?? ''),
      serverId: String(row['serverId'] ?? ''),
      serverName: String(row['serverName'] ?? row['serverId'] ?? ''),
      scopes: Array.isArray(row['scopes']) ? row['scopes'].map(String) : [],
      operations: Object.fromEntries(
        Object.entries(operations).map(([key, active]) => [key, Boolean(active)]),
      ),
    };
  });
}

export interface NormalizedProjectAccessLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  projectId: string;
  serverId: string;
}

export function normalizeProjectAccessLogs(response: unknown): NormalizedProjectAccessLog[] {
  return unwrapArray<Record<string, unknown>>(response, ['logs', 'data']).map((log) => ({
    id: String(log['id'] ?? ''),
    timestamp: String(log['changedAt'] ?? log['createdAt'] ?? ''),
    action: String(log['action'] ?? ''),
    actor: String(log['changedBy'] ?? log['actor'] ?? 'unknown'),
    projectId: String(log['projectId'] ?? ''),
    serverId: String(log['serverId'] ?? ''),
  }));
}

// ─── Projects ──────────────────────────────────────────────────────────

export function isProjectKeyActive(record: {
  isActive?: boolean | undefined;
  isKeyRevoked?: boolean | undefined;
}): boolean {
  return !record.isKeyRevoked && record.isActive !== false;
}

export interface NormalizedProjectKeyInfo {
  prefix: string;
  active: boolean;
  createdAt?: string | undefined;
}

export function normalizeProjectKeyInfo(response: unknown): NormalizedProjectKeyInfo {
  const record = asRecord(response) ?? {};
  return {
    prefix: String(record['apiKeyPrefix'] ?? record['prefix'] ?? 'unknown'),
    active: isProjectKeyActive({
      isActive: typeof record['isActive'] === 'boolean' ? record['isActive'] : undefined,
      isKeyRevoked:
        typeof record['isKeyRevoked'] === 'boolean' ? record['isKeyRevoked'] : undefined,
    }),
    createdAt:
      typeof (record['apiKeyCreatedAt'] ?? record['createdAt']) === 'string'
        ? String(record['apiKeyCreatedAt'] ?? record['createdAt'])
        : undefined,
  };
}

export function normalizeCreatedProject<T extends { id: string }>(
  response: unknown,
): {
  apiKey: string;
  project: T;
} {
  const record = asRecord(response) ?? {};
  const project = (asRecord(record['project']) ?? record) as unknown as T;
  return { apiKey: String(record['apiKey'] ?? ''), project };
}
