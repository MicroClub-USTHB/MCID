import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prompts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/prompts.js')>()),
  promptConfirm: vi.fn(async () => true),
}));
vi.mock('../browser.js', () => ({ openBrowser: vi.fn(async () => true) }));

import { promptConfirm } from '../lib/prompts.js';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID, PROJECT_ID } from '../test-support/fixtures.js';
import { resolveProjectKey } from './dev.js';

const originalCwd = process.cwd();
const originalTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

function setTty(value: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
}

afterEach(() => {
  if (originalTty) Object.defineProperty(process.stdin, 'isTTY', originalTty);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  process.chdir(originalCwd);
  cleanupCliTest();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const PORT = 39878;
const ssoArgs = [
  'dev',
  'sso',
  '--project',
  'Portal',
  '--api-key',
  'mcid_live_key',
  '--port',
  String(PORT),
  '--timeout',
  '1',
];

function routes(redirectUri: string, onPatch?: (body: unknown) => void) {
  return baseRoutes({
    [`GET /admin/projects/${PROJECT_ID}`]: () => json({ redirectUri }),
    [`PATCH /admin/projects/${PROJECT_ID}/redirect-uri`]: (_url, init) => {
      onPatch?.(JSON.parse(String(init.body)));
      return json({});
    },
    [`GET /admin/projects/${PROJECT_ID}/servers`]: () =>
      json([{ serverId: MAIN_SERVER_ID, scopes: ['read_members'] }]),
  });
}

describe('dev sso redirect URI pre-check', () => {
  it('fails with the fix command when stdin is not a terminal', async () => {
    const result = await runCli(ssoArgs, { routes: routes('https://app.example.test/cb') });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('mcid-cli project redirect-uri add');
    expect(result.requests.some((r) => r.method === 'PATCH')).toBe(false);
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it('offers to add it on a terminal and keeps the URIs already stored', async () => {
    setTty(true);
    let sent: unknown;
    await runCli(ssoArgs, {
      routes: routes('https://app.example.test/cb', (body) => (sent = body)),
    });

    expect(promptConfirm).toHaveBeenCalledOnce();
    expect(sent).toEqual({
      redirectUri: `https://app.example.test/cb,http://localhost:${PORT}/callback`,
    });
  });

  it('does not add it when the offer is declined', async () => {
    setTty(true);
    vi.mocked(promptConfirm).mockResolvedValueOnce(false);
    const result = await runCli(ssoArgs, { routes: routes('https://app.example.test/cb') });

    expect(result.exitCode).toBe(2);
    expect(result.requests.some((r) => r.method === 'PATCH')).toBe(false);
  });
});

describe('project key lookup order', () => {
  it('prefers --api-key, then MCID_API_KEY, then ./.env, and says which it used', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcid-key-'));
    await writeFile(join(dir, '.env'), 'MCID_API_KEY=from_dotenv\n');
    process.chdir(dir);
    vi.stubEnv('MCID_API_KEY', 'from_env');
    vi.stubEnv('MCID_API_URL', 'http://localhost:3000');

    const flag = await resolveProjectKey('from_flag');
    expect([flag.apiKey, flag.source]).toEqual(['from_flag', '--api-key flag']);

    const env = await resolveProjectKey();
    expect([env.apiKey, env.source]).toEqual(['from_env', 'MCID_API_KEY env']);

    vi.stubEnv('MCID_API_KEY', '');
    const dotenv = await resolveProjectKey();
    expect([dotenv.apiKey, dotenv.source]).toEqual(['from_dotenv', 'local .env file']);
  });
});
