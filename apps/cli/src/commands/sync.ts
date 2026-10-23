import { Command } from 'commander';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import { formatAge, printJson, printSuccess, printTable, toCsv } from '../lib/output.js';
import { resolveServer } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';

interface SyncStatusRecord {
  serverId: string;
  serverName?: string;
  status: string;
  lastSyncedAt?: string | null;
  durationMs?: number | null;
  membersSynced?: number;
  rolesSynced?: number;
  membersAdded?: number;
  membersRemoved?: number;
  membersUpdated?: number;
}

interface SyncLogRecord {
  id: string;
  serverId: string;
  syncType: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  membersSynced?: number;
  rolesSynced?: number;
  error?: string | null;
}

export function registerSyncCommand(program: Command): void {
  const syncCmd = program
    .command('sync')
    .description('Run, inspect, and monitor Discord server sync');

  // sync run [--server <s>] [--wait] [--timeout <s>]
  syncCmd
    .command('run')
    .description('Trigger a full Discord synchronization')
    .option('--server <server>', 'Server to sync (defaults to main server)')
    .option('--wait', 'Wait for sync to complete with live progress')
    .option('--timeout <seconds>', 'Maximum seconds to wait (default 120)', '120')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server?: string;
        wait?: boolean;
        timeout: string;
        profile?: string;
        json?: boolean;
      }) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveServer(client, options.server);

          const trigger = await client.post<{ syncLogId?: string; id?: string; status?: string }>(
            '/admin/sync/full',
            { serverId: resolved.id },
          );

          const syncLogId = trigger.syncLogId || trigger.id;

          if (!options.wait) {
            if (options.json) {
              printJson({ ...trigger, server: resolved });
              return;
            }
            printSuccess(
              `Sync queued for "${resolved.name}"`,
              syncLogId
                ? `follow logs with: mcid-cli sync logs --server ${resolved.id}`
                : undefined,
            );
            return;
          }

          // Wait for sync to complete
          const timeoutMs = parseInt(options.timeout, 10) * 1000;
          const startTime = Date.now();
          const spinChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
          let spinIdx = 0;

          process.stdout.write(`Syncing server "${colors.bold(resolved.name)}"...\n`);

          while (Date.now() - startTime < timeoutMs) {
            const statusRes = await client.get<SyncStatusRecord>(
              `/admin/sync/status?serverId=${encodeURIComponent(resolved.id)}`,
            );

            const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
            const spin = spinChars[spinIdx++ % spinChars.length] ?? '•';

            if (process.stdout.isTTY) {
              process.stdout.write(
                `\r  ${colors.cyan(spin)} [${elapsedSec}s] Status: ${statusRes.status} (members: ${statusRes.membersSynced ?? 0}, roles: ${statusRes.rolesSynced ?? 0})   `,
              );
            }

            if (statusRes.status === 'success') {
              if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
              const dur = statusRes.durationMs
                ? `${(statusRes.durationMs / 1000).toFixed(1)}s`
                : `${elapsedSec}s`;
              const added =
                statusRes.membersAdded !== undefined
                  ? ` (+${statusRes.membersAdded}, -${statusRes.membersRemoved ?? 0})`
                  : '';
              printSuccess(
                `Synced ${resolved.name} in ${dur}: ${statusRes.membersSynced ?? 0} members${added}, ${statusRes.rolesSynced ?? 0} roles`,
              );
              if (options.json) {
                printJson(statusRes);
              }
              return;
            }

            if (statusRes.status === 'failed') {
              if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
              throw new CliError(
                `Sync failed for "${resolved.name}"\n  hint: check error logs with \`mcid-cli sync logs --server ${resolved.id}\``,
                ExitCode.Rejected,
              );
            }

            await new Promise((r) => setTimeout(r, 1500));
          }

          if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
          throw new CliError(
            `Sync timed out after ${options.timeout}s\n  hint: check status with \`mcid-cli sync status --server ${resolved.id}\``,
            ExitCode.Unexpected,
          );
        } catch (err) {
          exitWithError('sync run', err);
        }
      },
    );

  // sync status [--server <s>] [--all]
  syncCmd
    .command('status')
    .description('View sync status for a server or all servers')
    .option('--server <server>', 'Specific server')
    .option('--all', 'Show sync status across all servers')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .action(
      async (options: {
        server?: string;
        all?: boolean;
        profile?: string;
        json?: boolean;
        output?: 'table' | 'json' | 'csv';
      }) => {
        try {
          const client = await getClient(options.profile);

          if (options.all) {
            const list = await client.get<SyncStatusRecord[]>('/admin/sync/status/all');
            const outFormat = options.json ? 'json' : options.output || 'table';
            if (outFormat === 'json') {
              printJson(list);
              return;
            }
            if (outFormat === 'csv') {
              process.stdout.write(toCsv(list as unknown as Record<string, unknown>[]));
              return;
            }

            printTable({
              columns: [
                {
                  header: 'SERVER',
                  format: (_, r) => String(r['serverName'] || r['serverId'] || '-'),
                },
                {
                  header: 'STATUS',
                  format: (_, r) => {
                    const st = String(r['status'] || 'never');
                    if (st === 'success') return colors.green('success');
                    if (st === 'in_progress') return colors.cyan('in_progress');
                    if (st === 'failed') return colors.red('failed');
                    return colors.yellow(st);
                  },
                },
                {
                  header: 'LAST SYNC',
                  key: 'lastSyncedAt',
                  format: (v) => formatAge(typeof v === 'string' ? v : undefined),
                },
                {
                  header: 'MEMBERS',
                  key: 'membersSynced',
                  format: (v) => String(v ?? '-'),
                },
                {
                  header: 'ROLES',
                  key: 'rolesSynced',
                  format: (v) => String(v ?? '-'),
                },
              ],
              data: list as unknown as Record<string, unknown>[],
            });
            return;
          }

          const resolved = await resolveServer(client, options.server);
          const status = await client.get<SyncStatusRecord>(
            `/admin/sync/status?serverId=${encodeURIComponent(resolved.id)}`,
          );

          if (options.json) {
            printJson(status);
            return;
          }

          printTable({
            columns: [
              { header: 'SERVER', format: () => resolved.name },
              {
                header: 'STATUS',
                format: () => {
                  if (status.status === 'success') return colors.green('success');
                  if (status.status === 'in_progress') return colors.cyan('in_progress');
                  if (status.status === 'failed') return colors.red('failed');
                  return colors.yellow(status.status || 'never');
                },
              },
              {
                header: 'LAST SYNC',
                key: 'lastSyncedAt',
                format: (v) => formatAge(typeof v === 'string' ? v : undefined),
              },
              { header: 'MEMBERS', key: 'membersSynced', format: (v) => String(v ?? '-') },
              { header: 'ROLES', key: 'rolesSynced', format: (v) => String(v ?? '-') },
            ],
            data: [status as unknown as Record<string, unknown>],
          });
        } catch (err) {
          exitWithError('sync status', err);
        }
      },
    );

  // sync logs [--server <s>]
  syncCmd
    .command('logs')
    .description('View recent sync execution logs')
    .option('--server <server>', 'Filter by server (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, options.server);
        const logs = await client.get<SyncLogRecord[]>(
          `/admin/sync/logs?serverId=${encodeURIComponent(resolved.id)}`,
        );

        if (options.json) {
          printJson(logs);
          return;
        }

        printTable({
          columns: [
            { header: 'LOG ID', key: 'id', format: (v) => colors.dim(String(v)) },
            { header: 'TYPE', key: 'syncType', format: (v) => String(v) },
            {
              header: 'STATUS',
              format: (_, r) => {
                const st = String(r['status'] || '');
                if (st === 'success') return colors.green('success');
                if (st === 'failed') return colors.red('failed');
                return colors.yellow(st);
              },
            },
            {
              header: 'STARTED',
              key: 'startedAt',
              format: (v) => formatAge(typeof v === 'string' ? v : undefined),
            },
            { header: 'MEMBERS', key: 'membersSynced', format: (v) => String(v ?? '-') },
            { header: 'ROLES', key: 'rolesSynced', format: (v) => String(v ?? '-') },
          ],
          data: logs as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('sync logs', err);
      }
    });

  // sync changes <syncLogId> [--type added|removed|updated]
  syncCmd
    .command('changes <syncLogId>')
    .description('View itemized member and role changes for a sync run')
    .option('--type <type>', 'Filter by action (added, removed, updated)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .action(
      async (
        syncLogId: string,
        options: {
          type?: string;
          profile?: string;
          json?: boolean;
          output?: 'table' | 'json' | 'csv';
        },
      ) => {
        try {
          const client = await getClient(options.profile);
          let path = `/admin/sync/logs/${encodeURIComponent(syncLogId)}/changes`;
          if (options.type) {
            path += `?type=${encodeURIComponent(options.type)}`;
          }
          const changes = await client.get<Record<string, unknown>[]>(path);

          const outFormat = options.json ? 'json' : options.output || 'table';
          if (outFormat === 'json') {
            printJson(changes);
            return;
          }
          if (outFormat === 'csv') {
            process.stdout.write(toCsv(changes));
            return;
          }

          printTable({
            columns: [
              { header: 'ENTITY', key: 'entityType', format: (v) => colors.bold(String(v)) },
              { header: 'ACTION', key: 'action', format: (v) => String(v) },
              { header: 'IDENTIFIER', key: 'entityId', format: (v) => colors.dim(String(v)) },
              { header: 'NAME', key: 'entityName', format: (v) => String(v ?? '-') },
            ],
            data: changes,
          });
        } catch (err) {
          exitWithError('sync changes', err);
        }
      },
    );
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
