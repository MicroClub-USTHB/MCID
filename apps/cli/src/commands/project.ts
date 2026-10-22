import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import { confirmDestructive } from '../lib/confirm.js';
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
import { promptConfirm, promptInput, promptSelect } from '../lib/prompts.js';
import { resolveProject, resolveServer } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';

interface ProjectRecord {
  id: string;
  name: string;
  description?: string | null;
  redirectUri?: string | null;
  apiKeyPrefix?: string | null;
  apiKeyCreatedAt?: string | null;
  isKeyRevoked?: boolean;
  createdAt?: string;
  updatedAt?: string;
  serversCount?: number;
}

export function registerProjectCommand(program: Command): void {
  const projectCmd = program
    .command('project')
    .description('Manage MCID projects, API keys, redirect URIs, and server access');

  // project list / ls
  const listAction = async (options: {
    profile?: string;
    json?: boolean;
    output?: 'table' | 'json' | 'csv';
    quiet?: boolean;
  }) => {
    try {
      const client = await getClient(options.profile);
      const projects = await client.get<ProjectRecord[]>('/admin/projects', {
        resource: 'project',
      });

      if (options.quiet) {
        printQuiet(projects.map((p) => p.id));
        return;
      }

      const outFormat = options.json ? 'json' : options.output || 'table';
      if (outFormat === 'json') {
        printJson(projects);
        return;
      }
      if (outFormat === 'csv') {
        process.stdout.write(toCsv(projects as unknown as Record<string, unknown>[]));
        return;
      }

      printTable({
        columns: [
          { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
          { header: 'NAME', key: 'name', format: (v) => colors.bold(String(v)) },
          {
            header: 'KEY STATUS',
            format: (_, r) => (r.isKeyRevoked ? colors.red('revoked') : colors.green('active')),
          },
          {
            header: 'REDIRECT URIS',
            format: (_, r) => {
              const rUri = r['redirectUri'];
              const uris = typeof rUri === 'string' ? rUri.split(',').filter(Boolean) : [];
              return uris.length > 0 ? `${uris.length} URI(s)` : colors.dim('none');
            },
          },
          { header: 'AGE', key: 'createdAt', format: (v) => colors.dim(formatAge(v as string)) },
        ],
        data: projects as unknown as Record<string, unknown>[],
      });
    } catch (err) {
      exitWithError('project list', err);
    }
  };

  projectCmd
    .command('list')
    .alias('ls')
    .description('List all projects')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as raw JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .option('-q, --quiet', 'Only print project IDs')
    .action(listAction);

  // project get <project>
  projectCmd
    .command('get <project>')
    .description('Get project details')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as raw JSON')
    .action(async (projectIdOrName: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        const project = await client.get<ProjectRecord>(`/admin/projects/${resolved.id}`, {
          resource: 'project',
          id: resolved.id,
        });

        // Also get granted servers
        let servers: { serverId: string; scopes: string[] }[] = [];
        try {
          servers = await client.get(`/admin/projects/${resolved.id}/servers`);
        } catch {
          // ignore if secondary call fails
        }

        if (options.json) {
          printJson({ ...project, servers });
          return;
        }

        const uris = project.redirectUri ? project.redirectUri.split(',').filter(Boolean) : [];
        printKeyValue({
          ID: project.id,
          Name: project.name,
          Description: project.description || '-',
          'Key Prefix': project.apiKeyPrefix ? `${project.apiKeyPrefix}...` : '-',
          'Key Status': project.isKeyRevoked ? colors.red('revoked') : colors.green('active'),
          'Redirect URIs': uris.length > 0 ? uris.join(', ') : colors.dim('none'),
          'Granted Servers':
            servers.length > 0
              ? servers.map((s) => `${s.serverId} (${s.scopes.join(', ')})`).join(', ')
              : colors.dim('none'),
          Created: formatDate(project.createdAt),
          Updated: formatDate(project.updatedAt),
        });
      } catch (err) {
        exitWithError('project get', err);
      }
    });

  // project create
  projectCmd
    .command('create')
    .description('Create a new project and generate an API key')
    .option('--name <name>', 'Project name')
    .option('--description <desc>', 'Project description')
    .option('--redirect-uri <urls...>', 'Allowed redirect URI(s)')
    .option('--env-file <path>', 'Write .env block to file')
    .option('--force', 'Overwrite existing MCID_API_KEY in env file')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as raw JSON')
    .action(async (options: {
      name?: string;
      description?: string;
      redirectUri?: string[];
      envFile?: string;
      force?: boolean;
      profile?: string;
      json?: boolean;
    }) => {
      try {
        const client = await getClient(options.profile);

        let name = options.name;
        let redirectUris = options.redirectUri;

        // Interactive wizard when flags omitted and TTY
        if (!name && process.stdin.isTTY) {
          name = await promptInput({
            message: 'Project name',
            validate: (v) => (v.length > 0 ? true : 'Name cannot be empty'),
          });

          const defaultUri = 'http://localhost:3000/callback';
          const enteredUri = await promptInput({
            message: 'Primary OAuth redirect URI',
            default: defaultUri,
          });
          redirectUris = [enteredUri || defaultUri];
        }

        if (!name) {
          throw new CliError('Project name is required (--name <name>)', ExitCode.Usage);
        }

        const commaUris = redirectUris ? redirectUris.join(',') : undefined;
        const res = await client.post<{
          id: string;
          name: string;
          apiKey: string;
          redirectUri?: string;
        }>('/admin/projects', {
          name,
          description: options.description,
          redirectUri: commaUris,
        });

        if (options.json) {
          printJson(res, true);
          return;
        }

        printSuccess(
          `Project "${colors.bold(res.name)}" created (id: ${res.id})`,
          `mcid-cli project key show ${res.id}`,
        );

        process.stdout.write('\n');
        process.stdout.write(
          `${colors.bold('API Key')} (save this now; it will not be shown again):\n`,
        );
        process.stdout.write(`  ${colors.green(res.apiKey)}\n\n`);

        const primaryUri = redirectUris && redirectUris[0] ? redirectUris[0] : 'http://localhost:3000/callback';
        const envBlock = [
          `MCID_API_URL=${client.origin}/api`,
          `MCID_API_KEY=${res.apiKey}`,
          `MCID_REDIRECT_URI=${primaryUri}`,
        ].join('\n');

        if (options.envFile) {
          let existing = '';
          try {
            existing = await readFile(options.envFile, 'utf8');
          } catch {
            // file doesn't exist
          }

          if (existing.includes('MCID_API_KEY=') && !options.force) {
            throw new CliError(
              `File "${options.envFile}" already contains MCID_API_KEY\n  hint: pass --force to overwrite`,
              ExitCode.Rejected,
            );
          }

          const newContent = existing ? `${existing.trimEnd()}\n\n${envBlock}\n` : `${envBlock}\n`;
          await writeFile(options.envFile, newContent, 'utf8');
          printSuccess(`Saved environment configuration to ${options.envFile}`);
        } else {
          process.stdout.write(`${colors.dim('.env configuration block:')}\n`);
          process.stdout.write(`${envBlock}\n`);
        }
      } catch (err) {
        exitWithError('project create', err);
      }
    });

  // project update <project>
  projectCmd
    .command('update <project>')
    .description('Update project details')
    .option('--name <name>', 'New project name')
    .option('--description <desc>', 'New description')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, options: {
      name?: string;
      description?: string;
      profile?: string;
    }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        await client.patch(`/admin/projects/${resolved.id}`, {
          name: options.name,
          description: options.description,
        });
        printSuccess(`Project "${resolved.name}" updated`);
      } catch (err) {
        exitWithError('project update', err);
      }
    });

  // project delete <project>
  projectCmd
    .command('delete <project>')
    .alias('rm')
    .description('Delete a project')
    .option('--yes', 'Skip confirmation prompt')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, options: { yes?: boolean; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        await confirmDestructive({
          resourceType: 'project',
          resourceName: resolved.name,
          yesFlag: options.yes,
        });
        await client.delete(`/admin/projects/${resolved.id}`);
        printSuccess(`Project "${resolved.name}" deleted`);
      } catch (err) {
        exitWithError('project delete', err);
      }
    });

  // project redirect-uri group
  const redirectUriCmd = projectCmd.command('redirect-uri').description('Manage allowed OAuth redirect URIs');

  redirectUriCmd
    .command('list <project>')
    .description('List allowed redirect URIs for a project')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (projectIdOrName: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        const project = await client.get<ProjectRecord>(`/admin/projects/${resolved.id}`);
        const uris = project.redirectUri ? project.redirectUri.split(',').filter(Boolean) : [];

        if (options.json) {
          printJson(uris);
          return;
        }

        if (uris.length === 0) {
          process.stdout.write(colors.dim('No redirect URIs configured.\n'));
          return;
        }
        for (const uri of uris) {
          process.stdout.write(`- ${uri}\n`);
        }
      } catch (err) {
        exitWithError('project redirect-uri list', err);
      }
    });

  redirectUriCmd
    .command('add <project> <url>')
    .description('Add an allowed redirect URI without removing existing ones')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, url: string, options: { profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        const project = await client.get<ProjectRecord>(`/admin/projects/${resolved.id}`);
        const currentUris = project.redirectUri ? project.redirectUri.split(',').filter(Boolean) : [];

        if (!currentUris.includes(url)) {
          currentUris.push(url);
          await client.patch(`/admin/projects/${resolved.id}/redirect-uri`, {
            redirectUri: currentUris.join(','),
          });
        }
        printSuccess(`Added redirect URI "${url}" to project "${resolved.name}"`);
      } catch (err) {
        exitWithError('project redirect-uri add', err);
      }
    });

  redirectUriCmd
    .command('remove <project> <url>')
    .description('Remove an allowed redirect URI')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, url: string, options: { profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        const project = await client.get<ProjectRecord>(`/admin/projects/${resolved.id}`);
        const currentUris = project.redirectUri ? project.redirectUri.split(',').filter(Boolean) : [];
        const nextUris = currentUris.filter((u) => u !== url);

        await client.patch(`/admin/projects/${resolved.id}/redirect-uri`, {
          redirectUri: nextUris.join(','),
        });
        printSuccess(`Removed redirect URI "${url}" from project "${resolved.name}"`);
      } catch (err) {
        exitWithError('project redirect-uri remove', err);
      }
    });

  // project key group
  const keyCmd = projectCmd.command('key').description('Manage project API keys');

  keyCmd
    .command('show <project>')
    .description('Show project API key status and prefix')
    .option('--reveal', 'Reveal full key (if supported)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (projectIdOrName: string, options: { reveal?: boolean; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        const keyInfo = await client.get<{
          prefix?: string;
          apiKeyPrefix?: string;
          isKeyRevoked?: boolean;
          createdAt?: string;
        }>(`/admin/projects/${resolved.id}/api-key`);

        if (options.json) {
          printJson(keyInfo, options.reveal);
          return;
        }

        const prefix = keyInfo.apiKeyPrefix || keyInfo.prefix || 'unknown';
        printKeyValue({
          Project: resolved.name,
          Status: keyInfo.isKeyRevoked ? colors.red('revoked') : colors.green('active'),
          Prefix: `${prefix}...`,
          Created: formatDate(keyInfo.createdAt),
        });
      } catch (err) {
        exitWithError('project key show', err);
      }
    });

  keyCmd
    .command('rotate <project>')
    .description('Rotate the API key for a project (invalidates previous key immediately)')
    .option('--yes', 'Skip confirmation')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, options: { yes?: boolean; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);

        if (!options.yes && process.stdin.isTTY) {
          const ok = await promptConfirm({
            message: `Rotate API key for "${resolved.name}"? The current key will stop working immediately`,
          });
          if (!ok) {
            process.stdout.write('Key rotation cancelled.\n');
            return;
          }
        }

        const res = await client.post<{ apiKey: string }>(
          `/admin/projects/${resolved.id}/regenerate-api-key`,
        );
        printSuccess(`API key rotated for project "${resolved.name}"`);
        process.stdout.write(`\nNew API Key: ${colors.green(res.apiKey)}\n`);
        process.stdout.write(colors.dim('Save this now; it cannot be retrieved again.\n'));
      } catch (err) {
        exitWithError('project key rotate', err);
      }
    });

  keyCmd
    .command('revoke <project>')
    .description('Revoke the API key for a project')
    .option('--yes', 'Skip confirmation')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, options: { yes?: boolean; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);

        if (!options.yes && process.stdin.isTTY) {
          const ok = await promptConfirm({
            message: `Revoke API key for "${resolved.name}"? Apps using this key will immediately fail auth`,
          });
          if (!ok) return;
        }

        await client.delete(`/admin/projects/${resolved.id}/key`);
        printSuccess(`API key revoked for project "${resolved.name}"`);
      } catch (err) {
        exitWithError('project key revoke', err);
      }
    });

  keyCmd
    .command('restore <project>')
    .description('Restore a revoked API key')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, options: { profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        await client.post(`/admin/projects/${resolved.id}/restore-key`);
        printSuccess(`API key restored for project "${resolved.name}"`);
      } catch (err) {
        exitWithError('project key restore', err);
      }
    });

  // project access group
  const accessCmd = projectCmd.command('access').description('Manage project server access and permissions');

  accessCmd
    .command('list <project>')
    .description('List servers granted to a project')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (projectIdOrName: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveProject(client, projectIdOrName);
        const servers = await client.get<
          { serverId: string; scopes: string[]; operations?: Record<string, boolean> }[]
        >(`/admin/projects/${resolved.id}/servers`);

        if (options.json) {
          printJson(servers);
          return;
        }

        printTable({
          columns: [
            { header: 'SERVER ID', key: 'serverId', format: (v) => colors.dim(String(v)) },
            { header: 'SCOPES', key: 'scopes', format: (v) => Array.isArray(v) ? v.join(', ') : '-' },
            {
              header: 'OPERATIONS',
              format: (_, r) => {
                if (!r.operations) return colors.dim('defaults');
                return Object.entries(r.operations)
                  .filter(([, active]) => active)
                  .map(([op]) => op)
                  .join(', ') || colors.dim('none');
              },
            },
          ],
          data: servers as unknown as Record<string, unknown>[],
        });
      } catch (err) {
        exitWithError('project access list', err);
      }
    });

  accessCmd
    .command('grant <project> <server>')
    .description('Grant project access to a Discord server with scopes and operations')
    .requiredOption('--scope <scopes...>', 'Scopes to grant (read_members, check_permissions)')
    .option('--operation <ops...>', 'Operations to allow (READ, SEND_MESSAGES, MANAGE_WEBHOOKS)')
    .option('--profile <name>', 'Profile to use')
    .action(async (
      projectIdOrName: string,
      serverIdOrName: string,
      options: { scope: string[]; operation?: string[]; profile?: string },
    ) => {
      try {
        const client = await getClient(options.profile);
        const resolvedProject = await resolveProject(client, projectIdOrName);
        const resolvedServer = await resolveServer(client, serverIdOrName);

        const opsObj: Record<string, boolean> = {};
        if (options.operation) {
          for (const op of options.operation) {
            opsObj[op.toUpperCase()] = true;
          }
        }

        await client.put(`/admin/projects/${resolvedProject.id}/servers/${resolvedServer.id}`, {
          scopes: options.scope,
          operations: Object.keys(opsObj).length > 0 ? opsObj : undefined,
        });

        printSuccess(
          `Granted access for project "${resolvedProject.name}" on server "${resolvedServer.name}"`,
        );
      } catch (err) {
        exitWithError('project access grant', err);
      }
    });

  accessCmd
    .command('revoke <project> <server>')
    .description('Revoke project access to a Discord server')
    .option('--yes', 'Skip confirmation')
    .option('--profile <name>', 'Profile to use')
    .action(async (projectIdOrName: string, serverIdOrName: string, options: { yes?: boolean; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolvedProject = await resolveProject(client, projectIdOrName);
        const resolvedServer = await resolveServer(client, serverIdOrName);

        if (!options.yes && process.stdin.isTTY) {
          const ok = await promptConfirm({
            message: `Revoke access for project "${resolvedProject.name}" on server "${resolvedServer.name}"?`,
          });
          if (!ok) return;
        }

        await client.delete(`/admin/projects/${resolvedProject.id}/servers/${resolvedServer.id}`);
        printSuccess(`Revoked access for project "${resolvedProject.name}" on server "${resolvedServer.name}"`);
      } catch (err) {
        exitWithError('project access revoke', err);
      }
    });

  accessCmd
    .command('matrix')
    .description('View project-to-server access matrix')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const matrix = await client.get<unknown>('/admin/projects/access/matrix');
        printJson(matrix);
      } catch (err) {
        exitWithError('project access matrix', err);
      }
    });

  accessCmd
    .command('log')
    .description('View project access audit logs')
    .option('--project <project>', 'Filter by project')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { project?: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        let path = '/admin/projects/access/audit';
        if (options.project) {
          const p = await resolveProject(client, options.project);
          path += `?projectId=${encodeURIComponent(p.id)}`;
        }
        const logs = await client.get<Record<string, unknown>[]>(path);
        if (options.json) {
          printJson(logs);
          return;
        }
        printTable({
          columns: [
            { header: 'TIME', key: 'createdAt', format: (v) => formatAge(v as string) },
            { header: 'ACTION', key: 'action', format: (v) => colors.bold(String(v)) },
            { header: 'ACTOR', key: 'actor', format: (v) => colors.dim(String(v)) },
            { header: 'PROJECT', key: 'projectId', format: (v) => colors.dim(String(v)) },
            { header: 'SERVER', key: 'serverId', format: (v) => colors.dim(String(v)) },
          ],
          data: logs,
        });
      } catch (err) {
        exitWithError('project access log', err);
      }
    });
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
