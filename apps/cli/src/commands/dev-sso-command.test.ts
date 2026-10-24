import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../browser.js', () => ({
  openBrowser: vi.fn(async () => true),
}));

import { openBrowser } from '../browser.js';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID, PROJECT_ID } from '../test-support/fixtures.js';

afterEach(() => {
  cleanupCliTest();
  vi.clearAllMocks();
});

const SSO_PORT = 39877;

function ssoRoutes() {
  return baseRoutes({
    [`GET /admin/projects/${PROJECT_ID}`]: () =>
      json({ redirectUri: `http://localhost:${SSO_PORT}/callback` }),
    [`GET /admin/projects/${PROJECT_ID}/servers`]: () =>
      json([{ serverId: MAIN_SERVER_ID, scopes: ['read_members'] }]),
  });
}

const ssoArgs = [
  'dev',
  'sso',
  '--project',
  'Portal',
  '--silent',
  '--api-key',
  'mcid_live_key',
  '--port',
  String(SSO_PORT),
];

async function waitForListener(
  realFetch: typeof fetch,
  url: string,
  tries = 40,
): Promise<Response | undefined> {
  for (let i = 0; i < tries; i++) {
    try {
      return await realFetch(url, { redirect: 'error' } as RequestInit);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return undefined;
}

describe('dev sso callback listener', () => {
  it(
    'serves the callback on 127.0.0.1 without reflecting query values',
    { timeout: 20_000 },
    async () => {
      const realFetch = globalThis.fetch.bind(globalThis);
      const run = runCli([...ssoArgs, '--timeout', '1'], { routes: ssoRoutes() });

      // Wait for the listener, then hit the callback with a hostile error value.
      const res = await waitForListener(
        realFetch,
        `http://127.0.0.1:${SSO_PORT}/callback?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E&state=xyz`,
      );
      expect(res).toBeDefined();
      const body = await res!.text();

      expect(res!.status).toBe(400);
      expect(body).not.toContain('<script>');
      expect(body).not.toContain('alert(1)');

      // A callback that does not match this flow's state is ignored, and the
      // one-second timeout still ends the command.
      const result = await run;
      expect(result.exitCode).not.toBe(0);
    },
  );

  it('prints and opens the authorize URL in --silent mode', { timeout: 20_000 }, async () => {
    const result = await runCli([...ssoArgs, '--timeout', '1'], {
      routes: ssoRoutes(),
    });

    expect(result.stdout).toContain('/api/auth/sso/authorize');
    expect(result.stdout).toContain('prompt=none');
    expect(openBrowser).toHaveBeenCalledWith(expect.stringContaining('/api/auth/sso/authorize'));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/timed out|timeout/i);
  });
});
