import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import {
  formatAge,
  formatDate,
  printJson,
  printQuiet,
  printSuccess,
  printTable,
  toCsv,
} from '../lib/output.js';
import { resolveMember, resolveServer } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';

interface MemberListItem {
  id: string;
  discordId: string;
  username: string;
  displayName?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  joinedAt?: string | null;
  roles?: { id: string; name: string }[];
}

interface MemberCrossServerItem {
  discordId: string;
  username: string;
  serversCount: number;
  servers: { serverId: string; serverName: string; roles: string[] }[];
}

export function registerMemberCommand(program: Command): void {
  const memberCmd = program
    .command('member')
    .description('Search members, view cross-server memberships, and check permissions');

  // member list / ls
  const listAction = async (options: {
    server?: string;
    role?: string[];
    search?: string;
    joinedAfter?: string;
    crossServer?: boolean;
    profile?: string;
    json?: boolean;
    output?: 'table' | 'json' | 'csv';
    quiet?: boolean;
  }) => {
    try {
      const client = await getClient(options.profile);

      if (options.crossServer) {
        const res = await client.get<MemberCrossServerItem[]>('/admin/members/cross-server');
        if (options.quiet) {
          printQuiet(res.map((m) => m.discordId));
          return;
        }
        if (options.json || options.output === 'json') {
          printJson(res);
          return;
        }
        if (options.output === 'csv') {
          process.stdout.write(toCsv(res as unknown as Record<string, unknown>[]));
          return;
        }

        printTable({
          columns: [
            { header: 'DISCORD ID', key: 'discordId', format: (v) => colors.dim(String(v)) },
            { header: 'USERNAME', key: 'username', format: (v) => colors.bold(`@${v}`) },
            { header: 'SERVERS', key: 'serversCount', format: (v) => `${v} server(s)` },
            {
              header: 'MEMBERSHIPS',
              format: (_, r) => {
                const sList = r['servers'] as { serverName?: string; serverId?: string }[] | undefined;
                return sList ? sList.map((s) => s.serverName || s.serverId).join(', ') : '-';
              },
            },
          ],
          data: res as unknown as Record<string, unknown>[],
        });
        return;
      }

      const resolved = await resolveServer(client, options.server);
      const params = new URLSearchParams({ serverId: resolved.id });
      if (options.search) params.set('search', options.search);
      if (options.joinedAfter) params.set('joinedAfter', options.joinedAfter);
      if (options.role && options.role.length > 0) {
        for (const r of options.role) params.append('roleId', r);
      }

      const res = await client.get<{ data?: MemberListItem[]; members?: MemberListItem[] } | MemberListItem[]>(
        `/admin/members?${params.toString()}`,
      );

      const members: MemberListItem[] = Array.isArray(res)
        ? res
        : (res.data || res.members || []);

      if (options.quiet) {
        printQuiet(members.map((m) => m.discordId || m.id));
        return;
      }

      const outFormat = options.json ? 'json' : options.output || 'table';
      if (outFormat === 'json') {
        printJson(members);
        return;
      }
      if (outFormat === 'csv') {
        process.stdout.write(toCsv(members as unknown as Record<string, unknown>[]));
        return;
      }

      printTable({
        columns: [
          { header: 'DISCORD ID', format: (_, r) => colors.dim(String(r['discordId'] || r['id'] || '')) },
          { header: 'USERNAME', key: 'username', format: (v) => colors.bold(`@${v}`) },
          { header: 'NICKNAME', format: (_, r) => String(r['nickname'] || r['displayName'] || '-') },
          {
            header: 'ROLES',
            format: (_, r) => {
              const rList = r['roles'] as { name: string }[] | undefined;
              return rList && rList.length > 0
                ? rList.map((ro) => ro.name).join(', ')
                : colors.dim('none');
            },
          },
          { header: 'JOINED', key: 'joinedAt', format: (v) => colors.dim(formatAge(typeof v === 'string' ? v : undefined)) },
        ],
        data: members as unknown as Record<string, unknown>[],
      });
    } catch (err) {
      exitWithError('member list', err);
    }
  };

  memberCmd
    .command('list')
    .alias('ls')
    .description('List members on a Discord server with optional filters')
    .option('--server <server>', 'Discord server (defaults to main server)')
    .option('--role <role...>', 'Filter by role ID')
    .option('--search <query>', 'Search username, nickname, or ID')
    .option('--joined-after <date>', 'Filter members joined after ISO date')
    .option('--cross-server', 'Show members across all servers')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .option('-q, --quiet', 'Only print Discord IDs')
    .action(listAction);

  // member get <member>
  memberCmd
    .command('get <member>')
    .description('Get member details and server roles card')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (memberArg: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveMember(client, memberArg);
        const serversInfo = await client.get<{
          member: MemberListItem;
          servers: {
            serverId: string;
            serverName: string;
            joinedAt?: string;
            roles: { id: string; name: string }[];
          }[];
        }>(`/admin/members/${encodeURIComponent(resolved.discordId)}/servers`);

        if (options.json) {
          printJson(serversInfo);
          return;
        }

        const m = serversInfo.member || {
          username: resolved.username,
          discordId: resolved.discordId,
        };

        // Render readable card
        process.stdout.write(`\n${colors.bold(`@${m.username}`)} (${colors.dim(m.discordId)})\n`);
        if (m.nickname || m.displayName) {
          process.stdout.write(`Nickname: ${m.nickname || m.displayName}\n`);
        }
        if (m.avatar) {
          process.stdout.write(`Avatar:   ${colors.dim(m.avatar)}\n`);
        }
        process.stdout.write('\n');

        process.stdout.write(`${colors.bold('Server Memberships & Roles:')}\n`);
        const serverList = serversInfo.servers || [];
        if (serverList.length === 0) {
          process.stdout.write(colors.dim('  No server memberships found.\n'));
        } else {
          for (const s of serverList) {
            process.stdout.write(`  ${colors.cyan('●')} ${colors.bold(s.serverName || s.serverId)}\n`);
            if (s.joinedAt) {
              process.stdout.write(`    Joined: ${formatDate(s.joinedAt)} (${formatAge(s.joinedAt)})\n`);
            }
            const rolesStr =
              s.roles && s.roles.length > 0
                ? s.roles.map((r) => r.name).join(', ')
                : colors.dim('none');
            process.stdout.write(`    Roles:  ${rolesStr}\n`);
          }
        }
        process.stdout.write('\n');
      } catch (err) {
        exitWithError('member get', err);
      }
    });

  // member permissions <member> [--server <s>]
  memberCmd
    .command('permissions <member>')
    .description('Show resolved permissions for a member on a server')
    .option('--server <server>', 'Server to evaluate (defaults to main server)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (memberArg: string, options: { server?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);
        const resolvedMember = await resolveMember(client, memberArg);

        const permissions = await client.get<{
          permissions: {
            name: string;
            code?: string;
            inheritedFrom?: string;
            sourceRole?: string;
          }[];
        }>(`/permissions/${encodeURIComponent(resolvedServer.id)}/${encodeURIComponent(resolvedMember.discordId)}`);

        if (options.json) {
          printJson(permissions);
          return;
        }

        const list = permissions.permissions || [];
        process.stdout.write(
          `Resolved permissions for ${colors.bold(`@${resolvedMember.username}`)} on ${colors.bold(resolvedServer.name)}:\n\n`,
        );

        if (list.length === 0) {
          process.stdout.write(colors.dim('No permissions assigned.\n'));
          return;
        }

        printTable({
          columns: [
            { header: 'PERMISSION', format: (_, r) => colors.bold(String(r['code'] || r['name'] || '-')) },
            {
              header: 'SOURCE',
              format: (_, r) => {
                const inh = r['inheritedFrom'];
                const src = r['sourceRole'];
                if (inh) return `inherited via ${inh}`;
                if (src) return `role "${src}"`;
                return 'direct grant';
              },
            },
          ],
          data: list as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('member permissions', err);
      }
    });

  // member export
  memberCmd
    .command('export')
    .description('Export members to a CSV or JSON file')
    .option('--server <server>', 'Server to export (defaults to main server)')
    .option('--role <role...>', 'Filter by role ID')
    .option('-o, --output <format>', 'Export format (csv|json)', 'csv')
    .option('--file <path>', 'Destination file path')
    .option('--profile <name>', 'Profile to use')
    .action(async (options: {
      server?: string;
      role?: string[];
      output?: 'csv' | 'json';
      file?: string;
      profile?: string;
    }) => {
      try {
        const client = await getClient(options.profile);
        const resolvedServer = await resolveServer(client, options.server);

        const params = new URLSearchParams({ serverId: resolvedServer.id });
        if (options.role && options.role.length > 0) {
          for (const r of options.role) params.append('roleId', r);
        }

        const data = await client.get<Record<string, unknown>[]>(
          `/admin/members/export?${params.toString()}`,
        );

        const format = options.output || 'csv';
        const content = format === 'json' ? JSON.stringify(data, null, 2) : toCsv(data);
        const defaultFilename = `members-${resolvedServer.id}-${new Date().toISOString().slice(0, 10)}.${format}`;
        const targetFile = options.file || defaultFilename;

        await writeFile(targetFile, content, 'utf8');
        printSuccess(`Exported ${data.length} member(s) to ${targetFile}`);
      } catch (err) {
        exitWithError('member export', err);
      }
    });
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
