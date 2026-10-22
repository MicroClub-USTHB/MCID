import { Command } from 'commander';
import { ACCESS_LEVELS, ACCESS_RESOURCES, isAccessLevel, isAccessResource } from '@mcid/contracts';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import { printJson, printKeyValue, printSuccess, printTable } from '../lib/output.js';
import { promptConfirm } from '../lib/prompts.js';
import { resolveMember, resolveRole } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';

interface EffectiveAccessResponse {
  memberId: string;
  username: string;
  displayName?: string | null;
  root: boolean;
  access: Record<
    string,
    {
      level: string;
      source?: {
        type: 'root' | 'override' | 'role';
        roleId?: string;
        roleName?: string;
      };
    }
  >;
}

export function registerAccessCommand(program: Command): void {
  const accessCmd = program
    .command('access')
    .description('Inspect and manage admin access levels and role grants');

  // access catalog
  accessCmd
    .command('catalog')
    .description('List valid admin resources and access levels')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const catalog = await client.get<{
          resources: string[];
          levels: string[];
        }>('/admin/access/catalog');

        if (options.json) {
          printJson(catalog);
          return;
        }

        process.stdout.write(`${colors.bold('Admin Access Catalog')}\n\n`);
        process.stdout.write(`${colors.bold('Levels')} (ordered none < read < write < manage):\n`);
        for (const l of catalog.levels || ACCESS_LEVELS) {
          process.stdout.write(`  - ${l}\n`);
        }
        process.stdout.write(`\n${colors.bold('Resources')}:\n`);
        for (const r of catalog.resources || ACCESS_RESOURCES) {
          process.stdout.write(`  - ${r}\n`);
        }
      } catch (err) {
        exitWithError('access catalog', err);
      }
    });

  // access explain <member>
  accessCmd
    .command('explain <member>')
    .description('Explain effective admin access levels and their sources for a member')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (memberArg: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveMember(client, memberArg);
        const effective = await client.get<EffectiveAccessResponse>(
          `/admin/access/members/${encodeURIComponent(resolved.discordId)}/effective`,
        );

        if (options.json) {
          printJson(effective);
          return;
        }

        process.stdout.write(
          `Effective admin access for ${colors.bold(`@${effective.username}`)} (${colors.dim(effective.memberId)}):\n\n`,
        );

        if (effective.root) {
          process.stdout.write(
            `  ${colors.magenta('ROOT ADMIN')} — Holds root management role (all resources = manage)\n\n`,
          );
        }

        const entries = Object.entries(effective.access || {});
        const tableData = entries.map(([resource, info]) => {
          let sourceText = 'default';
          if (effective.root) {
            sourceText = 'root (MC_EXECUTIVE_ROLE_ID)';
          } else if (info.source) {
            if (info.source.type === 'role') {
              sourceText = `from role "${info.source.roleName || info.source.roleId || 'role'}"`;
            } else if (info.source.type === 'override') {
              sourceText = 'member override';
            }
          }

          let formattedLevel: string = info.level;
          if (info.level === 'manage') formattedLevel = colors.magenta('manage');
          else if (info.level === 'write') formattedLevel = colors.green('write');
          else if (info.level === 'read') formattedLevel = colors.cyan('read');
          else formattedLevel = colors.dim('none');

          return {
            resource,
            level: formattedLevel,
            source: sourceText,
          };
        });

        printTable({
          columns: [
            { header: 'RESOURCE', key: 'resource', format: (v) => colors.bold(String(v)) },
            { header: 'LEVEL', key: 'level' },
            { header: 'SOURCE', key: 'source', format: (v) => colors.dim(String(v)) },
          ],
          data: tableData as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('access explain', err);
      }
    });

  // access roles
  accessCmd
    .command('roles')
    .description('View main-server roles with their admin access grants')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const roles =
          await client.get<{ roleId: string; roleName: string; grants: Record<string, string> }[]>(
            '/admin/access/roles',
          );

        if (options.json) {
          printJson(roles);
          return;
        }

        printTable({
          columns: [
            { header: 'ROLE', key: 'roleName', format: (v) => colors.bold(String(v)) },
            { header: 'ROLE ID', key: 'roleId', format: (v) => colors.dim(String(v)) },
            {
              header: 'GRANTS',
              format: (_, r) => {
                const g = r['grants'] as Record<string, string> | undefined;
                if (!g || Object.keys(g).length === 0) return colors.dim('none');
                return Object.entries(g)
                  .filter(([, lvl]) => lvl !== 'none')
                  .map(([res, lvl]) => `${res}:${lvl}`)
                  .join(', ');
              },
            },
          ],
          data: roles as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('access roles', err);
      }
    });

  // access role set <role> <resource=level...>
  accessCmd
    .command('role-set <role> <grants...>')
    .alias('role set')
    .description('Update admin grants on a role (resource=level pairs)')
    .option('--replace', 'Replace all grants instead of merging')
    .option('--yes', 'Skip confirmation prompt')
    .option('--profile <name>', 'Profile to use')
    .action(
      async (
        roleArg: string,
        grantPairs: string[],
        options: { replace?: boolean; yes?: boolean; profile?: string },
      ) => {
        try {
          const client = await getClient(options.profile);
          // Roles for access grants are always on main server
          const resolvedRole = await resolveRole(client, '', roleArg);

          const newGrants: Record<string, string> = {};
          for (const pair of grantPairs) {
            const [res, lvl] = pair.split('=');
            if (!res || !lvl) {
              throw new CliError(
                `Invalid grant format "${pair}". Expected format: <resource>=<level>`,
                ExitCode.Usage,
              );
            }
            if (!isAccessResource(res)) {
              throw new CliError(
                `Unknown resource "${res}". Run \`mcid-cli access catalog\` to view valid resources.`,
                ExitCode.Usage,
              );
            }
            if (!isAccessLevel(lvl)) {
              throw new CliError(
                `Unknown access level "${lvl}". Expected one of: ${ACCESS_LEVELS.join(', ')}`,
                ExitCode.Usage,
              );
            }
            newGrants[res] = lvl;
          }

          // Fetch current grants unless --replace is passed
          let targetGrants: Record<string, string> = {};
          if (!options.replace) {
            const currentRoles =
              await client.get<{ roleId: string; grants: Record<string, string> }[]>(
                '/admin/access/roles',
              );
            const found = currentRoles.find((r) => r.roleId === resolvedRole.id);
            if (found && found.grants) {
              targetGrants = { ...found.grants };
            }
          }
          Object.assign(targetGrants, newGrants);

          // Show diff
          process.stdout.write(
            `${colors.bold(`Updating grants for role "${resolvedRole.name}":`)}\n`,
          );
          for (const [r, l] of Object.entries(newGrants)) {
            process.stdout.write(`  ${colors.cyan('●')} ${r}: ${l}\n`);
          }

          if (!options.yes && process.stdin.isTTY) {
            const ok = await promptConfirm({
              message: `Apply grant changes to role "${resolvedRole.name}"?`,
            });
            if (!ok) return;
          }

          await client.put(`/admin/access/roles/${encodeURIComponent(resolvedRole.id)}`, {
            grants: targetGrants,
          });

          printSuccess(`Grants updated for role "${resolvedRole.name}"`);
        } catch (err) {
          exitWithError('access role set', err);
        }
      },
    );

  // access member get <member>
  accessCmd
    .command('member-get <member>')
    .alias('member get')
    .description('Get member-specific access overrides')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (memberArg: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveMember(client, memberArg);
        const res = await client.get<{
          memberId: string;
          username?: string;
          overrides: Record<string, string>;
        }>(`/admin/access/members/${encodeURIComponent(resolved.discordId)}`);

        if (options.json) {
          printJson(res);
          return;
        }

        printKeyValue({
          Member: `@${resolved.username} (${resolved.discordId})`,
          Overrides:
            Object.keys(res.overrides || {}).length > 0
              ? Object.entries(res.overrides)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(', ')
              : colors.dim('none'),
        });
      } catch (err) {
        exitWithError('access member get', err);
      }
    });

  // access member set <member> <resource=level...>
  accessCmd
    .command('member-set <member> <grants...>')
    .alias('member set')
    .description('Set member-specific access overrides')
    .option('--replace', 'Replace all overrides instead of merging')
    .option('--yes', 'Skip confirmation prompt')
    .option('--profile <name>', 'Profile to use')
    .action(
      async (
        memberArg: string,
        grantPairs: string[],
        options: { replace?: boolean; yes?: boolean; profile?: string },
      ) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveMember(client, memberArg);

          const newOverrides: Record<string, string> = {};
          for (const pair of grantPairs) {
            const [res, lvl] = pair.split('=');
            if (!res || !lvl) {
              throw new CliError(
                `Invalid format "${pair}". Expected format: <resource>=<level>`,
                ExitCode.Usage,
              );
            }
            if (!isAccessResource(res)) {
              throw new CliError(
                `Unknown resource "${res}". Run \`mcid-cli access catalog\``,
                ExitCode.Usage,
              );
            }
            if (!isAccessLevel(lvl)) {
              throw new CliError(
                `Unknown access level "${lvl}". Expected one of: ${ACCESS_LEVELS.join(', ')}`,
                ExitCode.Usage,
              );
            }
            newOverrides[res] = lvl;
          }

          let targetOverrides: Record<string, string> = {};
          if (!options.replace) {
            const current = await client
              .get<{ overrides: Record<string, string> }>(
                `/admin/access/members/${encodeURIComponent(resolved.discordId)}`,
              )
              .catch(() => ({ overrides: {} }));
            targetOverrides = { ...(current.overrides || {}) };
          }
          Object.assign(targetOverrides, newOverrides);

          process.stdout.write(
            `${colors.bold(`Setting overrides for member @${resolved.username}:`)}\n`,
          );
          for (const [r, l] of Object.entries(newOverrides)) {
            process.stdout.write(`  ${colors.cyan('●')} ${r}: ${l}\n`);
          }

          if (!options.yes && process.stdin.isTTY) {
            const ok = await promptConfirm({
              message: `Apply overrides to member @${resolved.username}?`,
            });
            if (!ok) return;
          }

          await client.put(`/admin/access/members/${encodeURIComponent(resolved.discordId)}`, {
            grants: targetOverrides,
          });

          printSuccess(`Overrides updated for member @${resolved.username}`);
        } catch (err) {
          exitWithError('access member set', err);
        }
      },
    );

  // access member unset <member> <resource>
  accessCmd
    .command('member-unset <member> <resource>')
    .alias('member unset')
    .description('Delete a member-specific access override')
    .option('--yes', 'Skip confirmation prompt')
    .option('--profile <name>', 'Profile to use')
    .action(
      async (memberArg: string, resource: string, options: { yes?: boolean; profile?: string }) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveMember(client, memberArg);

          if (!options.yes && process.stdin.isTTY) {
            const ok = await promptConfirm({
              message: `Remove override for "${resource}" from member @${resolved.username}?`,
            });
            if (!ok) return;
          }

          await client.delete(
            `/admin/access/members/${encodeURIComponent(resolved.discordId)}/${encodeURIComponent(resource)}`,
          );

          printSuccess(`Removed override for "${resource}" from @${resolved.username}`);
        } catch (err) {
          exitWithError('access member unset', err);
        }
      },
    );

  // access overrides
  accessCmd
    .command('overrides')
    .description('List all members with active access overrides')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const overrides = await client.get<
          {
            memberId: string;
            username: string;
            resource: string;
            level: string;
            root?: boolean;
          }[]
        >('/admin/access/overrides');

        if (options.json) {
          printJson(overrides);
          return;
        }

        printTable({
          columns: [
            {
              header: 'MEMBER',
              format: (_, r) => colors.bold(`@${r['username'] || r['memberId']}`),
            },
            { header: 'DISCORD ID', key: 'memberId', format: (v) => colors.dim(String(v)) },
            { header: 'RESOURCE', key: 'resource' },
            { header: 'OVERRIDE LEVEL', key: 'level', format: (v) => colors.yellow(String(v)) },
          ],
          data: overrides as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('access overrides', err);
      }
    });
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
