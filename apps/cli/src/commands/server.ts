import { Command } from 'commander';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import { confirmDestructive } from '../lib/confirm.js';
import {
  formatAge,
  formatDate,
  printJson,
  printKeyValue,
  printQuiet,
  printSuccess,
  printTable,
  toCsv,
} from '../lib/output.js';
import { resolveServer } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';

interface ServerRecord {
  id: string;
  name: string;
  isMain?: boolean;
  isActive?: boolean;
  autoSyncEnabled?: boolean;
  syncFrequencyHours?: number;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ChannelRecord {
  id: string;
  name: string;
  type?: number | string;
  categoryName?: string;
  parentId?: string | null;
  position?: number;
}

export function registerServerCommand(program: Command): void {
  const serverCmd = program
    .command('server')
    .description('Manage Discord servers and channels');

  // server list / ls
  const listAction = async (options: {
    profile?: string;
    json?: boolean;
    output?: 'table' | 'json' | 'csv';
    quiet?: boolean;
  }) => {
    try {
      const client = await getClient(options.profile);
      const servers = await client.get<ServerRecord[]>('/servers', { resource: 'server' });

      if (options.quiet) {
        printQuiet(servers.map((s) => s.id));
        return;
      }

      const outFormat = options.json ? 'json' : options.output || 'table';
      if (outFormat === 'json') {
        printJson(servers);
        return;
      }
      if (outFormat === 'csv') {
        process.stdout.write(toCsv(servers as unknown as Record<string, unknown>[]));
        return;
      }

      printTable({
        columns: [
          { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
          {
            header: 'NAME',
            format: (_, r) => {
              const name = colors.bold(String(r['name'] || ''));
              return r['isMain'] ? `${name} ${colors.cyan('[main]')}` : name;
            },
          },
          {
            header: 'STATUS',
            format: (_, r) => (r.isActive !== false ? colors.green('active') : colors.red('disabled')),
          },
          {
            header: 'LAST SYNC',
            key: 'lastSyncedAt',
            format: (v) => colors.dim(formatAge(typeof v === 'string' ? v : undefined)),
          },
        ],
        data: servers as unknown as Record<string, unknown>[],
      });
    } catch (err) {
      exitWithError('server list', err);
    }
  };

  serverCmd
    .command('list')
    .alias('ls')
    .description('List all registered Discord servers')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .option('-q, --quiet', 'Only print server IDs')
    .action(listAction);

  // server get <server>
  serverCmd
    .command('get [server]')
    .description('Get server details (defaults to main server if omitted)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverIdOrName: string | undefined, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverIdOrName);
        const server = await client.get<ServerRecord>(`/servers/${resolved.id}`, {
          resource: 'server',
          id: resolved.id,
        });

        if (options.json) {
          printJson(server);
          return;
        }

        printKeyValue({
          ID: server.id,
          Name: server.name + (server.isMain ? ' [main]' : ''),
          Status: server.isActive !== false ? colors.green('active') : colors.red('disabled'),
          'Main Server': server.isMain ? 'yes' : 'no',
          'Auto Sync': server.autoSyncEnabled ? `enabled (every ${server.syncFrequencyHours}h)` : 'disabled',
          'Last Synced': server.lastSyncedAt ? `${formatDate(server.lastSyncedAt)} (${formatAge(server.lastSyncedAt)})` : 'never',
          Created: formatDate(server.createdAt),
          Updated: formatDate(server.updatedAt),
        });
      } catch (err) {
        exitWithError('server get', err);
      }
    });

  // server add <guild-id>
  serverCmd
    .command('add <guild-id>')
    .description('Register a new Discord server (guild) in MCID')
    .option('--name <name>', 'Server name override')
    .option('--profile <name>', 'Profile to use')
    .action(async (guildId: string, options: { name?: string; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const res = await client.post<ServerRecord>('/servers', {
          serverId: guildId,
          name: options.name || guildId,
        });
        printSuccess(`Server "${res.name}" registered (ID: ${res.id})`);
      } catch (err) {
        exitWithError('server add', err);
      }
    });

  // server update <server>
  serverCmd
    .command('update <server>')
    .description('Update server settings')
    .option('--name <name>', 'New name')
    .option('--profile <name>', 'Profile to use')
    .action(async (serverIdOrName: string, options: { name?: string; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverIdOrName);
        await client.patch(`/servers/${resolved.id}`, {
          name: options.name,
        });
        printSuccess(`Server "${resolved.name}" updated`);
      } catch (err) {
        exitWithError('server update', err);
      }
    });

  // server enable <server>
  serverCmd
    .command('enable <server>')
    .description('Enable a server')
    .option('--profile <name>', 'Profile to use')
    .action(async (serverIdOrName: string, options: { profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverIdOrName);
        await client.patch(`/servers/${resolved.id}/enable`);
        printSuccess(`Server "${resolved.name}" enabled`);
      } catch (err) {
        exitWithError('server enable', err);
      }
    });

  // server disable <server>
  serverCmd
    .command('disable <server>')
    .description('Disable a server')
    .option('--profile <name>', 'Profile to use')
    .action(async (serverIdOrName: string, options: { profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverIdOrName);
        if (resolved.isMain) {
          throw new CliError('The main server cannot be disabled or deleted.', ExitCode.Rejected);
        }
        await client.patch(`/servers/${resolved.id}/disable`);
        printSuccess(`Server "${resolved.name}" disabled`);
      } catch (err) {
        exitWithError('server disable', err);
      }
    });

  // server delete <server>
  serverCmd
    .command('delete <server>')
    .alias('rm')
    .description('Delete a server')
    .option('--yes', 'Skip confirmation')
    .option('--profile <name>', 'Profile to use')
    .action(async (serverIdOrName: string, options: { yes?: boolean; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverIdOrName);
        if (resolved.isMain) {
          throw new CliError('The main server cannot be disabled or deleted.', ExitCode.Rejected);
        }
        await confirmDestructive({
          resourceType: 'server',
          resourceName: resolved.name,
          yesFlag: options.yes,
        });
        await client.delete(`/servers/${resolved.id}`);
        printSuccess(`Server "${resolved.name}" deleted`);
      } catch (err) {
        exitWithError('server delete', err);
      }
    });

  // server channels <server>
  serverCmd
    .command('channels [server]')
    .description('List channels for a server')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverIdOrName: string | undefined, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverIdOrName);
        const channels = await client.get<ChannelRecord[]>(
          `/admin/servers/${resolved.id}/channels`,
        );

        if (options.json) {
          printJson(channels);
          return;
        }

        printTable({
          columns: [
            { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
            { header: 'NAME', key: 'name', format: (v) => colors.bold(String(v)) },
            { header: 'CATEGORY', key: 'categoryName', format: (v) => String(v || '-') },
            { header: 'TYPE', key: 'type', format: (v) => String(v ?? '-') },
          ],
          data: channels as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('server channels', err);
      }
    });

  // server channel <server> <channel>
  serverCmd
    .command('channel [server] <channel>')
    .description('Inspect a channel and optionally view recent messages')
    .option('--messages <n>', 'Number of recent messages to fetch')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (
      serverArg: string | undefined,
      channelId: string,
      options: { messages?: string; profile?: string; json?: boolean },
    ) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveServer(client, serverArg);
        const channel = await client.get<ChannelRecord>(
          `/admin/servers/${resolved.id}/channels/${channelId}`,
        );

        let messages: unknown[] = [];
        if (options.messages) {
          messages = await client.get(
            `/admin/servers/${resolved.id}/channels/${channelId}/messages?limit=${options.messages}`,
          );
        }

        if (options.json) {
          printJson({ channel, messages });
          return;
        }

        printKeyValue({
          ID: channel.id,
          Name: channel.name,
          Category: channel.categoryName || '-',
          Type: channel.type ?? '-',
        });

        if (messages.length > 0) {
          process.stdout.write(`\n${colors.bold('Recent Messages:')}\n`);
          for (const msg of messages as Record<string, unknown>[]) {
            const author = (msg.author as { username?: string })?.username || 'unknown';
            process.stdout.write(
              `  [${colors.dim(formatAge(msg.createdAt as string))}] ${colors.cyan(`@${author}`)}: ${msg.content}\n`,
            );
          }
        }
      } catch (err) {
        exitWithError('server channel', err);
      }
    });
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
