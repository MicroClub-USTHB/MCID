import { createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { validateSchema } from '@mcid/form-schema';
import { Command } from 'commander';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider, decrypt, webhookSecretContext } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import {
  formatAge,
  printJson,
  printKeyValue,
  printSuccess,
  printTable,
  toCsv,
} from '../lib/output.js';
import { resolveWebhook } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { resolveSession } from '../session.js';
import {
  defaultWebhookDeps,
  webhookCreate,
  webhookDelete,
  webhookGet,
  webhookList,
  webhookRolesSet,
  webhookRotateSecret,
  webhookSecretGet,
  webhookUpdate,
  type WebhookCreateOptions,
  type WebhookDeleteOptions,
  type WebhookGetOptions,
  type WebhookListOptions,
  type WebhookRolesSetOptions,
  type WebhookRotateSecretOptions,
  type WebhookSecretGetOptions,
  type WebhookUpdateOptions,
} from '../webhook-flow.js';

export function registerWebhookCommand(program: Command): void {
  const webhook = program.command('webhook').description('Manage MCID Inbound Webhooks');

  // Existing commands
  webhook
    .command('create <schema-path>')
    .description('Create a webhook on MCID from a schema file and store its signing secret')
    .requiredOption('--name <name>', 'webhook display name')
    .option('--project <projectId>', 'owning MCID project id (omit to pick interactively)')
    .requiredOption(
      '--roles <roleIds>',
      'comma-separated Discord role ids allowed to read submissions',
    )
    .option('--accept-origin <origin>', 'accepted origin (repeatable)', collect, [])
    .option('--slug <slug>', 'URL-safe id, unique in the project (default: derived from --name)')
    .option('--reveal', 'print the signing secret in plain text')
    .requiredOption('--profile <name>', 'profile to create on')
    .action(async (schemaPath: string, options: WebhookCreateOptions) => {
      try {
        await webhookCreate(schemaPath, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook create', err);
      }
    });

  webhook
    .command('update <id>')
    .description('Update an existing webhook')
    .option('--schema <path>', 'replacement schema file')
    .option('--name <name>', 'new display name')
    .option('--active', 'mark the webhook active')
    .option('--inactive', 'mark the webhook inactive')
    .requiredOption('--profile <name>', 'profile to update on')
    .action(async (id: string, options: WebhookUpdateOptions) => {
      try {
        await webhookUpdate(id, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook update', err);
      }
    });

  webhook
    .command('list')
    .alias('ls')
    .description('List webhooks')
    .option('--project <projectId>', 'filter by project id')
    .option('--profile <name>', 'profile to use')
    .action(async (options: WebhookListOptions) => {
      try {
        await webhookList(options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook list', err);
      }
    });

  webhook
    .command('get <id>')
    .description('Inspect one webhook')
    .option('--schema-only', 'print only the schema')
    .option('--json', 'emit machine-readable JSON')
    .option('--profile <name>', 'profile to use')
    .action(async (id: string, options: WebhookGetOptions) => {
      try {
        await webhookGet(id, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook get', err);
      }
    });

  webhook
    .command('delete <id>')
    .alias('rm')
    .description('Delete a webhook and all its submissions')
    .option('--yes', 'skip the confirmation prompt')
    .requiredOption('--profile <name>', 'profile to delete on')
    .action(async (id: string, options: WebhookDeleteOptions) => {
      try {
        await webhookDelete(id, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook delete', err);
      }
    });

  const roles = webhook.command('roles').description('Manage allowed reader roles');
  roles
    .command('set <id>')
    .description('Replace the allowed-reader role list')
    .requiredOption('--roles <roleIds>', 'comma-separated Discord role ids')
    .requiredOption('--profile <name>', 'profile to update on')
    .action(async (id: string, options: WebhookRolesSetOptions) => {
      try {
        await webhookRolesSet(id, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook roles set', err);
      }
    });

  webhook
    .command('rotate-secret <id>')
    .description("Rotate a webhook's signing secret")
    .option('--reveal', 'print the secret in plain text')
    .option('--yes', 'skip the confirmation prompt')
    .requiredOption('--profile <name>', 'profile to rotate on')
    .action(async (id: string, options: WebhookRotateSecretOptions) => {
      try {
        await webhookRotateSecret(id, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook rotate-secret', err);
      }
    });

  const secret = webhook.command('secret').description('Read a locally stored signing secret');
  secret
    .command('get [webhook]')
    .description(
      'Retrieve a stored signing secret by webhook id or slug (prompts if omitted and more than one is stored)',
    )
    .option('--reveal', 'print the secret in plain text')
    .option('--profile <name>', 'profile to read from')
    .action(async (webhookArg: string | undefined, options: WebhookSecretGetOptions) => {
      try {
        await webhookSecretGet(webhookArg, options, defaultWebhookDeps());
      } catch (err) {
        exitWithError('webhook secret get', err);
      }
    });

  // ── Issue #233 Extensions: send, submissions, submission, watch, docs, settings, readable ──

  // webhook send <webhook> --data <file|-> [--example] [--print-curl]
  webhook
    .command('send <webhook>')
    .description('Sign and submit test payload to an Inbound Webhook')
    .option('--data <file>', 'Payload JSON file or "-" for stdin')
    .option('--example', 'Generate a valid sample payload from the webhook schema')
    .option('--print-curl', 'Print equivalent signed curl command without sending')
    .option('--profile <name>', 'Profile to use')
    .action(
      async (
        webhookArg: string,
        options: {
          data?: string;
          example?: boolean;
          printCurl?: boolean;
          profile?: string;
        },
      ) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveWebhook(client, webhookArg);
          const webhookDetail = await client.get<{
            id: string;
            schema: Record<string, unknown>;
            requireSignature?: boolean;
          }>(`/admin/inbound-webhooks/${resolved.id}`);

          // Retrieve stored signing secret
          const cfg = await loadConfig(configPath());
          const profile = resolveProfileName(cfg, options.profile);
          const storedSecret = await getStoredSigningSecret(cfg, profile, resolved.id);

          let rawPayload = '';
          if (options.example) {
            rawPayload = JSON.stringify(generateExamplePayload(webhookDetail.schema), null, 2);
          } else if (options.data === '-') {
            rawPayload = await readStdin();
          } else if (options.data) {
            rawPayload = await readFile(options.data, 'utf8');
          } else {
            throw new CliError(
              'Payload is required: pass --data <file|-> or --example',
              ExitCode.Usage,
            );
          }

          // Validate JSON
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawPayload);
          } catch {
            throw new CliError('Payload is not valid JSON', ExitCode.PrecheckFailed);
          }

          // Local Layer 1 validation against webhook schema
          const schemaCheck = validateSchema(parsed);
          if (!schemaCheck.ok && schemaCheck.errors.length > 0) {
            process.stderr.write(`${colors.red('Local Schema Validation Errors:')}\n`);
            for (const e of schemaCheck.errors) {
              process.stderr.write(`  ${colors.red(e.path)}  ${e.code}  ${e.message}\n`);
            }
          }

          // Sign payload
          const timestamp = Math.floor(Date.now() / 1000);
          const sigHex = createHmac('sha256', storedSecret)
            .update(`${timestamp}.${rawPayload}`, 'utf8')
            .digest('hex');
          const signatureHeader = `t=${timestamp},v1=${sigHex}`;
          const submitUrl = `${client.origin}/api/inbound-webhooks/${resolved.id}/submit`;

          if (options.printCurl) {
            process.stdout.write(
              `curl -X POST "${submitUrl}" \\\n` +
                `  -H "Content-Type: application/json" \\\n` +
                `  -H "X-MCID-Signature: ${signatureHeader}" \\\n` +
                `  -d '${rawPayload.replace(/'/g, "'\\''")}'\n`,
            );
            return;
          }

          // Send submission
          const res = await fetch(submitUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-MCID-Signature': signatureHeader,
            },
            body: rawPayload,
          });

          const status = res.status;
          let responseBody: unknown;
          try {
            responseBody = await res.json();
          } catch {
            responseBody = await res.text();
          }

          if (res.ok) {
            printSuccess(`Submission accepted (HTTP ${status})`);
            printJson(responseBody);
          } else {
            process.stderr.write(`${colors.red(`✗ Submission rejected (HTTP ${status})`)}\n`);
            printJson(responseBody);
            process.exitCode = ExitCode.Rejected;
          }
        } catch (err) {
          exitWithError('webhook send', err);
        }
      },
    );

  // webhook submissions <webhook> [--since <date>] [--until <date>] [--limit <n>] [--columns <cols>]
  webhook
    .command('submissions <webhook>')
    .description('List submissions received by an inbound webhook')
    .option('--since <date>', 'Filter submissions since date')
    .option('--until <date>', 'Filter submissions until date')
    .option('--limit <n>', 'Maximum submissions to return (default 30)', '30')
    .option('--columns <cols>', 'Comma-separated columns to display')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-o, --output <format>', 'Output format (table|json|csv)', 'table')
    .action(
      async (
        webhookArg: string,
        options: {
          since?: string;
          until?: string;
          limit: string;
          columns?: string;
          profile?: string;
          json?: boolean;
          output?: 'table' | 'json' | 'csv';
        },
      ) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveWebhook(client, webhookArg);

          const params = new URLSearchParams({ limit: options.limit });
          if (options.since) params.set('since', options.since);
          if (options.until) params.set('until', options.until);

          const subs = await client.get<Record<string, unknown>[]>(
            `/inbound-webhooks/${resolved.id}/submissions?${params.toString()}`,
          );

          const flattened = Array.isArray(subs) ? subs.map(flattenSubmission) : [];

          const outFormat = options.json ? 'json' : options.output || 'table';
          if (outFormat === 'json') {
            printJson(flattened);
            return;
          }
          if (outFormat === 'csv') {
            const cols = options.columns ? options.columns.split(',') : undefined;
            process.stdout.write(toCsv(flattened, cols));
            return;
          }

          if (flattened.length === 0) {
            process.stdout.write(colors.dim('No submissions found.\n'));
            return;
          }

          const cols = options.columns
            ? options.columns.split(',').map((c) => ({ header: c.toUpperCase(), key: c }))
            : [
                { header: 'ID', key: 'id', format: (v: unknown) => colors.dim(String(v)) },
                {
                  header: 'RECEIVED',
                  key: 'receivedAt',
                  format: (v: unknown) => formatAge(typeof v === 'string' ? v : undefined),
                },
                {
                  header: 'DATA SUMMARY',
                  format: (_: unknown, r: Record<string, unknown>) => {
                    const entries = Object.entries(r).filter(
                      ([k]) => k !== 'id' && k !== 'receivedAt',
                    );
                    return entries
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                      .join(' ');
                  },
                },
              ];

          printTable({
            columns: cols,
            data: flattened,
          });
        } catch (err) {
          exitWithError('webhook submissions', err);
        }
      },
    );

  // webhook submission <webhook> <submission-id>
  webhook
    .command('submission <webhook> <submissionId>')
    .description('Inspect a single webhook submission')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        webhookArg: string,
        submissionId: string,
        options: { profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveWebhook(client, webhookArg);
          const sub = await client.get<Record<string, unknown>>(
            `/inbound-webhooks/${resolved.id}/submissions/${submissionId}`,
          );

          if (options.json) {
            printJson(sub);
            return;
          }

          printKeyValue(flattenSubmission(sub));
        } catch (err) {
          exitWithError('webhook submission', err);
        }
      },
    );

  // webhook submissions export <webhook> [-o csv|json] [--file <path>]
  webhook
    .command('submissions-export <webhook>')
    .alias('submissions export')
    .description('Export all submissions for a webhook to CSV or JSON')
    .option('-o, --output <format>', 'Export format (csv|json)', 'csv')
    .option('--file <path>', 'Destination file path')
    .option('--profile <name>', 'Profile to use')
    .action(
      async (
        webhookArg: string,
        options: { output?: 'csv' | 'json'; file?: string; profile?: string },
      ) => {
        try {
          const client = await getClient(options.profile);
          const resolved = await resolveWebhook(client, webhookArg);
          const subs = await client.get<Record<string, unknown>[]>(
            `/inbound-webhooks/${resolved.id}/submissions?limit=1000`,
          );

          const flattened = Array.isArray(subs) ? subs.map(flattenSubmission) : [];
          const format = options.output || 'csv';
          const content = format === 'json' ? JSON.stringify(flattened, null, 2) : toCsv(flattened);
          const target =
            options.file ||
            `submissions-${resolved.slug}-${new Date().toISOString().slice(0, 10)}.${format}`;

          await writeFile(target, content, 'utf8');
          printSuccess(`Exported ${flattened.length} submission(s) to ${target}`);
        } catch (err) {
          exitWithError('webhook submissions export', err);
        }
      },
    );

  // webhook watch <webhook> [--json]
  webhook
    .command('watch <webhook>')
    .description('Stream incoming webhook submissions in real time')
    .option('--json', 'Stream NDJSON (newline-delimited JSON)')
    .option('--profile <name>', 'Profile to use')
    .action(async (webhookArg: string, options: { json?: boolean; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveWebhook(client, webhookArg);

        if (!options.json) {
          process.stdout.write(
            `Watching submissions for "${colors.bold(resolved.name)}" (Ctrl+C to stop)...\n\n`,
          );
        }

        const seenIds = new Set<string>();

        // Initial fetch to populate seen set
        const initial = await client
          .get<Record<string, unknown>[]>(`/inbound-webhooks/${resolved.id}/submissions?limit=20`)
          .catch(() => []);
        if (Array.isArray(initial)) {
          for (const s of initial) {
            if (typeof s['id'] === 'string') seenIds.add(s['id']);
          }
        }

        const interval = setInterval(async () => {
          try {
            const fresh = await client.get<Record<string, unknown>[]>(
              `/inbound-webhooks/${resolved.id}/submissions?limit=20`,
            );
            if (Array.isArray(fresh)) {
              for (const row of fresh) {
                const id = String(row['id'] || '');
                if (id && !seenIds.has(id)) {
                  seenIds.add(id);
                  if (options.json) {
                    process.stdout.write(JSON.stringify(row) + '\n');
                  } else {
                    const time = formatAge(
                      typeof row['receivedAt'] === 'string' ? row['receivedAt'] : undefined,
                    );
                    const flat = flattenSubmission(row);
                    const fields = Object.entries(flat)
                      .filter(([k]) => k !== 'id' && k !== 'receivedAt')
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                      .join(' ');
                    process.stdout.write(`  [${colors.dim(time)}] ${colors.bold(id)}: ${fields}\n`);
                  }
                }
              }
            }
          } catch {
            // ignore momentary network drops while watching
          }
        }, 2000);

        process.on('SIGINT', () => {
          clearInterval(interval);
          if (!options.json) process.stdout.write('\nStopped watching.\n');
          process.exit(0);
        });
      } catch (err) {
        exitWithError('webhook watch', err);
      }
    });

  // webhook docs <webhook> [--file <path>]
  webhook
    .command('docs <webhook>')
    .description('View or download Markdown integration docs for a webhook')
    .option('--file <path>', 'Save docs to file')
    .option('--profile <name>', 'Profile to use')
    .action(async (webhookArg: string, options: { file?: string; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        const resolved = await resolveWebhook(client, webhookArg);
        const res = await client.get<string | { markdown?: string }>(
          `/admin/inbound-webhooks/${resolved.id}/docs`,
        );

        const md = typeof res === 'string' ? res : res.markdown || JSON.stringify(res, null, 2);

        if (options.file) {
          await writeFile(options.file, md, 'utf8');
          printSuccess(`Integration documentation saved to ${options.file}`);
        } else {
          process.stdout.write(md + '\n');
        }
      } catch (err) {
        exitWithError('webhook docs', err);
      }
    });

  // webhook settings get / set
  const whSettings = webhook.command('settings').description('Inbound webhook global settings');

  whSettings
    .command('get')
    .description('View webhook global settings')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const s = await client.get<Record<string, unknown>>('/admin/inbound-webhooks/settings');
        printJson(s);
      } catch (err) {
        exitWithError('webhook settings get', err);
      }
    });

  whSettings
    .command('set')
    .description('Update webhook settings')
    .requiredOption('--reader-role <roleIds...>', 'Allowed reader role IDs')
    .option('--profile <name>', 'Profile to use')
    .action(async (options: { readerRole: string[]; profile?: string }) => {
      try {
        const client = await getClient(options.profile);
        await client.put('/admin/inbound-webhooks/settings', {
          readerRoleIds: options.readerRole,
        });
        printSuccess('Inbound webhook settings updated');
      } catch (err) {
        exitWithError('webhook settings set', err);
      }
    });

  // webhook readable
  webhook
    .command('readable')
    .description('List webhooks the current member has permission to read')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile);
        const list = await client.get<Record<string, unknown>[]>('/inbound-webhooks');

        if (options.json) {
          printJson(list);
          return;
        }

        printTable({
          columns: [
            { header: 'ID', key: 'id', format: (v) => colors.dim(String(v)) },
            { header: 'NAME', key: 'name', format: (v) => colors.bold(String(v)) },
            { header: 'SLUG', key: 'slug' },
            { header: 'PROJECT', key: 'projectId', format: (v) => colors.dim(String(v)) },
          ],
          data: list,
        });
      } catch (err) {
        exitWithError('webhook readable', err);
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function getClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}

async function getStoredSigningSecret(
  config: ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never,
  profileName: string,
  webhookId: string,
): Promise<string> {
  const profile = config.profiles[profileName];
  const stored = profile?.webhookSecrets;
  if (!stored || !(webhookId in stored)) {
    throw new CliError(
      `No signing secret found locally for webhook "${webhookId}"\n  hint: rotate the secret with \`mcid-cli webhook rotate-secret ${webhookId}\``,
      ExitCode.NotFound,
    );
  }
  const entry = stored[webhookId];
  if (!entry) throw new CliError('Signing secret not found', ExitCode.NotFound);
  const keys = defaultKeyProvider();
  return decrypt(entry.secret, keys, webhookSecretContext(profileName, webhookId));
}

function flattenSubmission(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: row['id'],
    receivedAt: row['receivedAt'] || row['createdAt'],
  };

  const data = (row['data'] || row['payload'] || {}) as Record<string, unknown>;
  const flattenObject = (obj: Record<string, unknown>, prefix = '') => {
    for (const [key, val] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        flattenObject(val as Record<string, unknown>, fullKey);
      } else {
        result[fullKey] = val;
      }
    }
  };

  if (typeof data === 'object' && data !== null) {
    flattenObject(data);
  }

  return result;
}

function generateExamplePayload(schema: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const fields = (schema['fields'] || []) as Record<string, unknown>[];

  for (const f of fields) {
    const key = String(f['name'] || f['key'] || '');
    const type = String(f['type'] || 'string');
    if (!key) continue;

    switch (type) {
      case 'string':
      case 'text':
        payload[key] = 'Sample text';
        break;
      case 'number':
        payload[key] = 42;
        break;
      case 'boolean':
        payload[key] = true;
        break;
      case 'email':
        payload[key] = 'user@example.com';
        break;
      case 'url':
        payload[key] = 'https://microclub.info';
        break;
      case 'phone':
        payload[key] = '+213555123456';
        break;
      case 'date':
        payload[key] = '2026-10-23';
        break;
      case 'datetime':
        payload[key] = '2026-10-23T12:00:00Z';
        break;
      case 'enum': {
        const opts = (f['options'] || ['option_a']) as string[];
        payload[key] = opts[0] || 'option_a';
        break;
      }
      case 'multi_enum': {
        const opts = (f['options'] || ['option_a']) as string[];
        payload[key] = [opts[0] || 'option_a'];
        break;
      }
      default:
        payload[key] = 'test';
    }
  }

  return payload;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}
