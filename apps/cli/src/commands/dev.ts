import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { openBrowser } from '../browser.js';
import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode, exitWithError } from '../errors.js';
import { ApiClient } from '../lib/client.js';
import { formatDate, printJson, printKeyValue, printSuccess } from '../lib/output.js';
import { resolveMember, resolveProject, resolveServer } from '../lib/resolver.js';
import { colors } from '../lib/tui.js';
import { createPkcePair } from '../pkce.js';
import { resolveSession } from '../session.js';

interface ProjectKeyLookup {
  apiKey: string;
  source: string;
  projectId?: string;
  baseUrl?: string;
}

export function registerDevCommand(program: Command): void {
  const devCmd = program
    .command('dev')
    .description('Developer commands to test project SSO, tokens, and permissions end to end');

  // dev sso [--project <p>] [--port 3000] [--silent] [--reveal]
  devCmd
    .command('sso')
    .description('Test SSO authorization flow end to end with a local callback listener')
    .option('--project <project>', 'Target project (reads key from flags/env/file if omitted)')
    .option('--port <port>', 'Local callback listener port (default 3000)', '3000')
    .option('--silent', 'Test silent login (prompt=none)')
    .option('--reveal', 'Print the full session token')
    .option('--api-key <key>', 'Explicit project API key')
    .option('--profile <name>', 'Profile for base URL')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        project?: string;
        port: string;
        silent?: boolean;
        reveal?: boolean;
        apiKey?: string;
        profile?: string;
        json?: boolean;
      }) => {
        try {
          const port = parseInt(options.port, 10);
          const redirectUri = `http://localhost:${port}/callback`;

          // 1. Resolve project key and base URL
          const keyInfo = await resolveProjectKey(options.apiKey, options.profile, options.project);
          const baseUrl = keyInfo.baseUrl || 'http://localhost:3000';

          process.stdout.write(
            `${colors.bold('Testing MCID Project SSO')} [key source: ${colors.cyan(keyInfo.source)}]\n\n`,
          );

          // 2. PKCE setup
          const pkce = createPkcePair();
          const state = Math.random().toString(36).slice(2);

          // 3. Start local callback listener
          let resolveCallback: (code: string) => void;
          let rejectCallback: (err: Error) => void;
          const callbackPromise = new Promise<string>((res, rej) => {
            resolveCallback = res;
            rejectCallback = rej;
          });

          const server = createServer((req, res) => {
            try {
              const reqUrl = new URL(req.url || '/', `http://localhost:${port}`);
              if (reqUrl.pathname === '/callback') {
                const code = reqUrl.searchParams.get('code');
                const returnedState = reqUrl.searchParams.get('state');
                const error = reqUrl.searchParams.get('error');

                if (error) {
                  res.writeHead(400, { 'Content-Type': 'text/html' });
                  res.end(`<h3>MCID SSO Error: ${error}</h3>`);
                  rejectCallback(new CliError(`SSO returned error: ${error}`, ExitCode.Rejected));
                  return;
                }

                if (!code || returnedState !== state) {
                  res.writeHead(400, { 'Content-Type': 'text/html' });
                  res.end('<h3>Invalid callback parameters</h3>');
                  rejectCallback(
                    new CliError('Callback missing code or state mismatch', ExitCode.Rejected),
                  );
                  return;
                }

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(
                  '<h3>SSO successful! You can close this tab and return to your terminal.</h3>',
                );
                resolveCallback(code);
              } else {
                res.writeHead(404);
                res.end();
              }
            } catch (err) {
              rejectCallback(err as Error);
            }
          });

          await new Promise<void>((res, rej) => {
            server.listen(port, () => res());
            server.once('error', rej);
          });

          const authParams = new URLSearchParams({
            redirect_uri: redirectUri,
            code_challenge: pkce.challenge,
            code_challenge_method: 'S256',
            state,
            ...(options.silent ? { prompt: 'none' } : {}),
          });

          const authorizeUrl = `${baseUrl}/api/auth/sso/authorize?${authParams.toString()}`;

          process.stdout.write(`  ${colors.cyan('1. Authorize')} -> Listening on ${redirectUri}\n`);

          if (options.silent) {
            process.stdout.write(`  Testing silent authorization (prompt=none)...\n`);
          } else {
            process.stdout.write(`  Opening browser to sign in: ${colors.dim(authorizeUrl)}\n`);
            await openBrowser(authorizeUrl);
          }

          let code: string;
          try {
            code = await callbackPromise;
          } finally {
            server.close();
          }

          process.stdout.write(
            `  ${colors.green('2. Callback received')} with authorization code\n`,
          );

          // 4. Exchange code for session token
          process.stdout.write(`  ${colors.cyan('3. Exchanging code for token')}...\n`);
          const tokenRes = await fetch(`${baseUrl}/api/auth/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': keyInfo.apiKey,
            },
            body: JSON.stringify({
              code,
              codeVerifier: pkce.verifier,
              redirectUri,
            }),
          });

          if (!tokenRes.ok) {
            const bodyText = await tokenRes.text();
            throw new CliError(
              `Token exchange failed (HTTP ${tokenRes.status}): ${bodyText}`,
              ExitCode.Rejected,
            );
          }

          const sessionData = (await tokenRes.json()) as {
            token?: string;
            accessToken?: string;
            expiresAt?: string;
          };
          const token = sessionData.token || sessionData.accessToken || '';
          process.stdout.write(`  ${colors.green('4. Token exchange successful')}\n`);

          // 5. Validate session token to fetch member & roles
          process.stdout.write(`  ${colors.cyan('5. Validating token')}...\n`);
          const validateRes = await fetch(`${baseUrl}/api/auth/validate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': keyInfo.apiKey,
            },
            body: JSON.stringify({ token }),
          });

          if (!validateRes.ok) {
            const bodyText = await validateRes.text();
            throw new CliError(
              `Token validation failed (HTTP ${validateRes.status}): ${bodyText}`,
              ExitCode.Rejected,
            );
          }

          const validateData = await validateRes.json();
          process.stdout.write(`  ${colors.green('6. Validation successful!')}\n\n`);

          if (options.json) {
            printJson({ session: sessionData, member: validateData }, options.reveal);
            return;
          }

          printSuccess('SSO Authentication Flow Complete');
          printKeyValue({
            'Token Status': colors.green('valid'),
            Token: options.reveal ? token : `${token.slice(0, 10)}... [pass --reveal to show full]`,
            Expires: formatDate(sessionData.expiresAt),
          });

          process.stdout.write('\n');
          printJson(validateData);
        } catch (err) {
          exitWithError('dev sso', err);
        }
      },
    );

  // dev token validate <token>
  devCmd
    .command('token-validate <token>')
    .alias('token validate')
    .description('Validate a session token using project API key')
    .option('--api-key <key>', 'Project API key')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (token: string, options: { apiKey?: string; profile?: string; json?: boolean }) => {
        try {
          const keyInfo = await resolveProjectKey(options.apiKey, options.profile);
          const baseUrl = keyInfo.baseUrl || 'http://localhost:3000';

          const res = await fetch(`${baseUrl}/api/auth/validate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': keyInfo.apiKey,
            },
            body: JSON.stringify({ token }),
          });

          if (!res.ok) {
            throw new CliError(
              `Session token is invalid or expired (HTTP ${res.status})`,
              ExitCode.Auth,
            );
          }

          const data = await res.json();
          if (options.json) {
            printJson(data);
            return;
          }

          printSuccess('Token is valid');
          printJson(data);
        } catch (err) {
          exitWithError('dev token validate', err);
        }
      },
    );

  // dev token refresh <refresh-token>
  devCmd
    .command('token-refresh <refreshToken>')
    .alias('token refresh')
    .description('Refresh an active session using refresh token')
    .option('--token <sessionToken>', 'Active session token')
    .option('--profile <name>', 'Profile to use')
    .option('--reveal', 'Show full token in output')
    .option('--json', 'Output as JSON')
    .action(
      async (
        refreshToken: string,
        options: { token?: string; profile?: string; reveal?: boolean; json?: boolean },
      ) => {
        try {
          const cfg = await loadConfig(configPath());
          const profile = resolveProfileName(cfg, options.profile);
          const baseUrl = cfg.profiles[profile]?.baseUrl || 'http://localhost:3000';

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (options.token) {
            headers.Authorization = `Bearer ${options.token}`;
          }

          const res = await fetch(`${baseUrl}/api/auth/token/refresh`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refreshToken }),
          });

          if (!res.ok) {
            throw new CliError(`Refresh failed (HTTP ${res.status})`, ExitCode.Auth);
          }

          const data = await res.json();
          if (options.json) {
            printJson(data, options.reveal);
            return;
          }

          printSuccess('Session refreshed successfully');
          printJson(data, options.reveal);
        } catch (err) {
          exitWithError('dev token refresh', err);
        }
      },
    );

  // dev check <member> <permissions...> [--server <s>]
  devCmd
    .command('check <member> <permissions...>')
    .description('Check permissions for a member on a server using project API key')
    .option('--server <server>', 'Context Discord server (defaults to main server)')
    .option('--api-key <key>', 'Project API key')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        memberArg: string,
        permArgs: string[],
        options: { server?: string; apiKey?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const keyInfo = await resolveProjectKey(options.apiKey, options.profile);
          const baseUrl = keyInfo.baseUrl || 'http://localhost:3000';

          const client = await getAdminClient(options.profile);
          const resolvedServer = await resolveServer(client, options.server);
          const resolvedMember = await resolveMember(client, memberArg);

          let anyDenied = false;
          const results: Record<string, boolean> = {};

          if (permArgs.length === 1) {
            const perm = permArgs[0]!;
            const res = await fetch(`${baseUrl}/api/permissions/check`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': keyInfo.apiKey,
              },
              body: JSON.stringify({
                discordId: resolvedMember.discordId,
                serverId: resolvedServer.id,
                permission: perm,
              }),
            });

            if (!res.ok) {
              throw new CliError(`Permission check failed (HTTP ${res.status})`, ExitCode.Rejected);
            }

            const checkData = (await res.json()) as { allowed: boolean };
            results[perm] = checkData.allowed;
            if (!checkData.allowed) anyDenied = true;
          } else {
            const res = await fetch(`${baseUrl}/api/permissions/check-batch`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': keyInfo.apiKey,
              },
              body: JSON.stringify({
                discordId: resolvedMember.discordId,
                serverId: resolvedServer.id,
                permissions: permArgs,
              }),
            });

            if (!res.ok) {
              throw new CliError(
                `Batch permission check failed (HTTP ${res.status})`,
                ExitCode.Rejected,
              );
            }

            const batchData = (await res.json()) as {
              allowed?: boolean;
              results?: Record<string, boolean>;
            };
            const rawResults = batchData.results || {};
            for (const p of permArgs) {
              const isAllowed = Boolean(rawResults[p]);
              results[p] = isAllowed;
              if (!isAllowed) anyDenied = true;
            }
          }

          if (options.json) {
            printJson({ member: resolvedMember, server: resolvedServer, results });
            if (anyDenied) process.exitCode = ExitCode.PrecheckFailed;
            return;
          }

          process.stdout.write(
            `Permission check for ${colors.bold(`@${resolvedMember.username}`)} on ${colors.bold(resolvedServer.name)}:\n\n`,
          );

          for (const [perm, allowed] of Object.entries(results)) {
            if (allowed) {
              process.stdout.write(`  ${colors.green('✓')} ${perm}: ${colors.green('allowed')}\n`);
            } else {
              process.stdout.write(`  ${colors.red('✗')} ${perm}: ${colors.red('denied')}\n`);
            }
          }

          if (anyDenied) {
            process.exitCode = ExitCode.PrecheckFailed;
          }
        } catch (err) {
          exitWithError('dev check', err);
        }
      },
    );

  // dev env [--project <p>] [--file .env]
  devCmd
    .command('env')
    .description('Print or write the .env block for a project')
    .option('--project <project>', 'Project name or ID')
    .option('--file <path>', 'Destination .env file')
    .option('--api-key <key>', 'Project API key')
    .option('--profile <name>', 'Profile to use')
    .action(
      async (options: { project?: string; file?: string; apiKey?: string; profile?: string }) => {
        try {
          const keyInfo = await resolveProjectKey(options.apiKey, options.profile, options.project);
          const baseUrl = keyInfo.baseUrl || 'http://localhost:3000';

          const envBlock = [
            `MCID_API_URL=${baseUrl}/api`,
            `MCID_API_KEY=${keyInfo.apiKey}`,
            `MCID_REDIRECT_URI=http://localhost:3000/callback`,
          ].join('\n');

          if (options.file) {
            await writeFile(options.file, `${envBlock}\n`, 'utf8');
            printSuccess(`Wrote project configuration to ${options.file}`);
          } else {
            process.stdout.write(`${envBlock}\n`);
          }
        } catch (err) {
          exitWithError('dev env', err);
        }
      },
    );
}

async function resolveProjectKey(
  flagKey?: string,
  profileFlag?: string,
  projectArg?: string,
): Promise<ProjectKeyLookup> {
  // 1. --api-key flag
  if (flagKey) {
    return { apiKey: flagKey, source: '--api-key flag' };
  }

  // 2. MCID_API_KEY env var
  if (process.env.MCID_API_KEY) {
    return { apiKey: process.env.MCID_API_KEY, source: 'MCID_API_KEY env' };
  }

  // 3. Local .env file
  try {
    const envContent = await readFile('.env', 'utf8');
    const match = envContent.match(/^MCID_API_KEY=(.+)$/m);
    if (match && match[1]) {
      return { apiKey: match[1].trim(), source: 'local .env file' };
    }
  } catch {
    // no .env file
  }

  // 4. Fetch project key if projectArg passed and session is available
  if (projectArg) {
    try {
      const client = await getAdminClient(profileFlag);
      const proj = await resolveProject(client, projectArg);
      const keyInfo = await client.get<{ apiKey?: string; apiKeyPrefix?: string }>(
        `/admin/projects/${proj.id}/api-key`,
      );
      if (keyInfo.apiKey) {
        return {
          apiKey: keyInfo.apiKey,
          source: `project "${proj.name}"`,
          baseUrl: client.origin,
          projectId: proj.id,
        };
      }
    } catch {
      // ignore
    }
  }

  throw new CliError(
    'No project API key found\n  hint: specify --api-key <key>, set MCID_API_KEY, or place it in .env',
    ExitCode.Usage,
  );
}

async function getAdminClient(profileFlag?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const profileName = resolveProfileName(config, profileFlag);
  const session = await resolveSession(config, profileName, defaultKeyProvider());
  return new ApiClient(session);
}
