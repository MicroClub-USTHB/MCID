import { configPath, loadConfig, resolveProfileName } from './config.js';
import { defaultKeyProvider, type KeyProvider } from './crypto-store.js';
import { CliError, ExitCode } from './errors.js';
import { adminDisplayName, getAdminMeRaw, parseAdminMe } from './mcid.js';
import { resolveSession } from './session.js';

export interface WhoamiOptions {
  profile?: string;
  json?: boolean;
}

export interface WhoamiDeps {
  configPath: string;
  keys: KeyProvider;
  /** The result (stdout, so it stays pipeable/scriptable). */
  out: (line: string) => void;
}

export function defaultWhoamiDeps(): WhoamiDeps {
  return {
    configPath: configPath(),
    keys: defaultKeyProvider(),
    out: (line) => process.stdout.write(`${line}\n`),
  };
}

/**
 * Read-only: resolves the session and asks MCID who it belongs to.
 * Respects MCID_TOKEN env var and reports auth source.
 */
export async function whoami(options: WhoamiOptions, deps: WhoamiDeps): Promise<void> {
  const config = await loadConfig(deps.configPath);
  const profileName = resolveProfileName(config, options.profile);
  const session = await resolveSession(config, profileName, deps.keys);

  const { status, body } = await getAdminMeRaw(session.baseUrl, session.token);
  if (status === 401) {
    const hint = session.isEnvToken
      ? 'check the MCID_TOKEN environment variable'
      : `run \`mcid-cli login --profile ${profileName}\``;
    throw new CliError(`session expired or invalid; ${hint}`, ExitCode.Auth);
  }
  if (status === 403) {
    throw new CliError(
      'this Discord account is not allowed to use the MCID admin API',
      ExitCode.Auth,
    );
  }

  if (options.json) {
    deps.out(JSON.stringify(body, null, 2));
    return;
  }

  const me = parseAdminMe(body);
  const authSource = session.isEnvToken ? '(via MCID_TOKEN env var)' : `on ${profileName}`;

  deps.out(`Logged in as ${adminDisplayName(me)} (${me.username}) ${authSource}`);
  deps.out(`MCID: ${session.baseUrl}`);
  deps.out(`Session expires: ${me.sessionExpiresAt}`);

  // The caller's own effective levels — the same data `access explain`
  // prints for somebody else. Missing on older APIs, so it is optional.
  const levels = Object.entries(me.permissions ?? {});
  if (levels.length > 0) {
    const width = Math.max(...levels.map(([resource]) => resource.length));
    deps.out('');
    deps.out(me.root ? 'Effective access (root: manage on every resource):' : 'Effective access:');
    for (const [resource, level] of levels) {
      deps.out(`  ${resource.padEnd(width)}  ${level}`);
    }
  }
}
