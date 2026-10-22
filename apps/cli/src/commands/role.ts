import { Command } from 'commander';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import {
  formatAge,
  formatDate,
  printError,
  printJson,
  printKeyValue,
  printQuiet,
  printSuccess,
  printTable,
  toCsv,
} from '../lib/output.js';
import { promptConfirm } from '../lib/prompts.js';
import { resolveRole, resolveServer } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';

interface RoleStatItem {
  id: string;
  name: string;
  color?: number | string;
  memberCount?: number;
  position?: number;
  permissionsCount?: number;
}

interface RolePermissionItem {
  id: number;
  key: string;
  description?: string;
}

interface ImpactPreviewResponse {
  affectedMembersCount: number;
  affectedMembers?: { id: string; username: string }[];
}

export function registerRoleCommand(program: Command): void {
  const roleCmd = program
    .command('role')
    .description('Inspect Discord roles, manage role permissions, and configure inheritance rules');

  // role list / ls
  const listAction = async (options: {
    server?: string;
    profile?: string;
    json?: boolean;
    output?: 'table' | 'json' | 'csv';
    quiet?: boolean;
  }) => {
    try {
      const client = await getClient(options.profile);
      const resolvedServer = await resolveServer(client, options.server);
      const roles = await client.get<RoleStatItem[]>(
        `/admin/stats/roles?serverId=${encodeURIComponent(resolvedServer.id)}`,
      );

      if (options.quiet) {
        printQuiet(roles.map((r) => r.id));
        return;
      }

      const outFormat = options.json ? 'json' : options.output || 'table';
      if (outFormat === 'json') {
        printJson(roles);
        return;
      }
      if (outFormat === 'csv') {
        process.stdout.write(toCsv(roles as unknown as Record<string, unknown>[]));
        return;
      }

      printTable({
        columns: [
          { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
          { header: 'ROLE NAME', key: 'name', format: (v) => colors.bold(String(v)) },
          {
            header: 'MEMBERS',
            key: 'memberCount',
            align: 'right',
            format: (v) => String(v ?? 0),
          },
        ],
        data: roles as unknown as Record<string, unknown>[],
      });
    } catch (err) {
      exitWithError('role list', err);
    }
  };

  roleCmd
    .command('list')
    .alias('ls')
    .description('List roles on a server with member counts')
    .option('--server <server>', 'Discord server (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .option('-q, --quiet', 'Only print role IDs')
    .action(listAction);

  // role get <role>
  roleCmd
    .command('get <role>')
    .description('Get role details, assigned permissions, and inheritance rules')
    .option('--server <server>', 'Discord server (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (roleArg: string, options: { server?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);
        const resolvedRole = await resolveRole(client, resolvedServer.id, roleArg);

        const permRes = await client.get<{ permissions: RolePermissionItem[] }>(
          `/permissions/admin/servers/${encodeURIComponent(resolvedServer.id)}/roles/${encodeURIComponent(resolvedRole.id)}/permissions`,
        ).catch(() => ({ permissions: [] }));

        if (options.json) {
          printJson({ role: resolvedRole, permissions: permRes.permissions });
          return;
        }

        printKeyValue({
          ID: resolvedRole.id,
          Name: resolvedRole.name,
          Server: `${resolvedServer.name} (${resolvedServer.id})`,
          'Assigned Permissions':
            permRes.permissions.length > 0
              ? permRes.permissions.map((p) => p.key).join(', ')
              : colors.dim('none'),
        });
      } catch (err) {
        exitWithError('role get', err);
      }
    });

  // role permissions group
  const permCmd = roleCmd.command('permissions').description('Manage role permissions');

  permCmd
    .command('list <role>')
    .alias('ls')
    .description('List permissions assigned to a role')
    .option('--server <server>', 'Discord server (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (roleArg: string, options: { server?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);
        const resolvedRole = await resolveRole(client, resolvedServer.id, roleArg);

        const res = await client.get<{ permissions: RolePermissionItem[] }>(
          `/permissions/admin/servers/${encodeURIComponent(resolvedServer.id)}/roles/${encodeURIComponent(resolvedRole.id)}/permissions`,
        );

        const list = res.permissions || [];
        if (options.json) {
          printJson(list);
          return;
        }

        if (list.length === 0) {
          process.stdout.write(colors.dim('No permissions assigned to this role.\n'));
          return;
        }

        printTable({
          columns: [
            { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
            { header: 'KEY', key: 'key', format: (v) => colors.bold(String(v)) },
            { header: 'DESCRIPTION', key: 'description', format: (v) => String(v || '-') },
          ],
          data: list as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('role permissions list', err);
      }
    });

  permCmd
    .command('add <role> <permissions...>')
    .description('Assign permission(s) to a role with impact preview')
    .option('--dry-run', 'Preview the impact without applying changes')
    .option('--yes', 'Skip confirmation prompt')
    .option('--server <server>', 'Discord server (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .action(async (
      roleArg: string,
      permArgs: string[],
      options: { dryRun?: boolean; yes?: boolean; server?: string; profile?: string },
    ) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);
        const resolvedRole = await resolveRole(client, resolvedServer.id, roleArg);

        // Parse permission IDs (numbers)
        const permissionIds = permArgs.map((p) => {
          const n = Number(p);
          if (isNaN(n)) throw new CliError(`Permission identifier must be an integer ID, got "${p}"`, ExitCode.Usage);
          return n;
        });

        // 1. Impact preview
        const preview = await client.post<ImpactPreviewResponse>(
          `/permissions/admin/servers/${encodeURIComponent(resolvedServer.id)}/roles/${encodeURIComponent(resolvedRole.id)}/impact`,
          {
            permissionIds,
            action: 'add',
          },
        );

        process.stdout.write(
          `${colors.cyan('Impact Preview:')} this change will affect ${colors.bold(String(preview.affectedMembersCount))} member(s).\n`,
        );

        if (options.dryRun) {
          process.stdout.write(colors.dim('Dry run complete. No modifications made.\n'));
          return;
        }

        // 2. Confirmation
        if (!options.yes && process.stdin.isTTY) {
          const ok = await promptConfirm({
            message: `Apply ${permissionIds.length} permission(s) to role "${resolvedRole.name}"?`,
          });
          if (!ok) {
            process.stdout.write('Cancelled.\n');
            return;
          }
        }

        // 3. Apply
        await client.post(
          `/permissions/admin/servers/${encodeURIComponent(resolvedServer.id)}/roles/${encodeURIComponent(resolvedRole.id)}/permissions`,
          {
            permissionIds,
          },
        );

        printSuccess(
          `Added ${permissionIds.length} permission(s) to role "${resolvedRole.name}" on ${resolvedServer.name}`,
        );
      } catch (err) {
        exitWithError('role permissions add', err);
      }
    });

  permCmd
    .command('remove <role> <permissions...>')
    .description('Remove permission(s) from a role with impact preview')
    .option('--dry-run', 'Preview the impact without applying changes')
    .option('--yes', 'Skip confirmation prompt')
    .option('--server <server>', 'Discord server (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .action(async (
      roleArg: string,
      permArgs: string[],
      options: { dryRun?: boolean; yes?: boolean; server?: string; profile?: string },
    ) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);
        const resolvedRole = await resolveRole(client, resolvedServer.id, roleArg);

        const permissionIds = permArgs.map((p) => {
          const n = Number(p);
          if (isNaN(n)) throw new CliError(`Permission identifier must be an integer ID, got "${p}"`, ExitCode.Usage);
          return n;
        });

        // 1. Impact preview
        const preview = await client.post<ImpactPreviewResponse>(
          `/permissions/admin/servers/${encodeURIComponent(resolvedServer.id)}/roles/${encodeURIComponent(resolvedRole.id)}/impact`,
          {
            permissionIds,
            action: 'remove',
          },
        );

        process.stdout.write(
          `${colors.cyan('Impact Preview:')} this removal will affect ${colors.bold(String(preview.affectedMembersCount))} member(s).\n`,
        );

        if (options.dryRun) {
          process.stdout.write(colors.dim('Dry run complete. No modifications made.\n'));
          return;
        }

        // 2. Confirmation
        if (!options.yes && process.stdin.isTTY) {
          const ok = await promptConfirm({
            message: `Remove ${permissionIds.length} permission(s) from role "${resolvedRole.name}"?`,
          });
          if (!ok) return;
        }

        // 3. Apply each removal
        for (const pid of permissionIds) {
          await client.delete(
            `/permissions/admin/servers/${encodeURIComponent(resolvedServer.id)}/roles/${encodeURIComponent(resolvedRole.id)}/permissions/${pid}`,
          );
        }

        printSuccess(
          `Removed ${permissionIds.length} permission(s) from role "${resolvedRole.name}" on ${resolvedServer.name}`,
        );
      } catch (err) {
        exitWithError('role permissions remove', err);
      }
    });

  // role inheritance group
  const inheritCmd = roleCmd.command('inheritance').description('Manage role permission inheritance rules');

  inheritCmd
    .command('list')
    .alias('ls')
    .description('List role inheritance rules')
    .option('--server <server>', 'Filter by server')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        let path = '/permissions/inheritance-rules';
        if (options.server) {
          const s = await resolveServer(client, options.server);
          path += `?serverId=${encodeURIComponent(s.id)}`;
        }
        const rules = await client.get<Record<string, unknown>[]>(path);

        if (options.json) {
          printJson(rules);
          return;
        }

        printTable({
          columns: [
            { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
            { header: 'SOURCE ROLE', key: 'sourceRoleId', format: (v) => colors.bold(String(v)) },
            { header: 'TARGET SCOPE', key: 'targetScope', format: (v) => String(v) },
            {
              header: 'STATUS',
              format: (_, r) => (r.enabled !== false ? colors.green('enabled') : colors.dim('disabled')),
            },
          ],
          data: rules,
        });
      } catch (err) {
        exitWithError('role inheritance list', err);
      }
    });

  inheritCmd
    .command('set <sourceRole>')
    .description('Configure inheritance for a source role')
    .option('--target-scope <scope>', 'Target scope (all, selected)', 'all')
    .option('--target-servers <servers...>', 'Selected target server IDs')
    .option('--server <server>', 'Discord server for context')
    .option('--profile <name>', 'Profile to use')
    .action(async (
      sourceRoleArg: string,
      options: { targetScope: 'all' | 'selected'; targetServers?: string[]; server?: string; profile?: string },
    ) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);
        const resolvedRole = await resolveRole(client, resolvedServer.id, sourceRoleArg);

        await client.post('/permissions/inheritance-rules', {
          sourceRoleId: resolvedRole.id,
          targetScope: options.targetScope,
          targetServerIds: options.targetServers,
          enabled: true,
        });

        printSuccess(`Inheritance rule configured for source role "${resolvedRole.name}"`);
      } catch (err) {
        exitWithError('role inheritance set', err);
      }
    });
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
