export const SERVER_TYPES = ['main', 'competition', 'event', 'other'] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

export const PERMISSION_POLICIES = ['deny_all', 'allow_all', 'custom'] as const;
export type PermissionPolicy = (typeof PERMISSION_POLICIES)[number];

export const SYNC_LOG_STATUSES = ['queued', 'in_progress', 'success', 'failed'] as const;
export type SyncLogStatus = (typeof SYNC_LOG_STATUSES)[number];

/** `/admin/sync/status` also reports `never` for servers that were never synced. */
export type SyncStatus = SyncLogStatus | 'never';

export const SYNC_TYPES = ['full', 'incremental', 'manual', 'reconnect'] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

export const SYNC_ENTITY_TYPES = ['member', 'role', 'server'] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const SYNC_CHANGE_ACTIONS = [
  'added',
  'removed',
  'updated',
  'deactivated',
  'role_assigned',
  'role_removed',
] as const;
export type SyncChangeAction = (typeof SYNC_CHANGE_ACTIONS)[number];

export const PROJECT_SCOPES = ['read_members', 'check_permissions'] as const;
export type ProjectScope = (typeof PROJECT_SCOPES)[number];

export const PROJECT_OPERATIONS = ['READ', 'SEND_MESSAGES', 'MANAGE_WEBHOOKS'] as const;
export type ProjectOperation = (typeof PROJECT_OPERATIONS)[number];
