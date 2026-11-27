import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { configPath } from '../config.js';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID, PROJECT_ID, projectRecord } from '../test-support/fixtures.js';

afterEach(cleanupCliTest);

describe('project access grant', () => {
  const existingGrants = [
    {
      serverId: MAIN_SERVER_ID,
      scopes: ['read_members'],
      operations: { READ: true, SEND_MESSAGES: true, MANAGE_WEBHOOKS: false },
    },
  ];

  const routes = (putBody: (body: unknown) => void) =>
    baseRoutes({
      [`GET /admin/projects/${PROJECT_ID}/servers`]: () => json(existingGrants),
      [`PUT /admin/projects/${PROJECT_ID}/servers/${MAIN_SERVER_ID}`]: (_url, init) => {
        putBody(JSON.parse(String(init.body)));
        return json(existingGrants[0]!);
      },
    });

  it('preserves existing operations when --operation is omitted', async () => {
    let sent: unknown;
    const result = await runCli(
      ['project', 'access', 'grant', 'Portal', 'Micro Club', '--scope', 'read_members'],
      { routes: routes((body) => (sent = body)) },
    );

    expect(result.exitCode).toBe(0);
    expect(sent).toEqual({
      scopes: ['read_members'],
      operations: { READ: true, SEND_MESSAGES: true, MANAGE_WEBHOOKS: false },
    });
  });

  it('sends all three operation booleans when --operation is given', async () => {
    let sent: unknown;
    const result = await runCli(
      [
        'project',
        'access',
        'grant',
        'Portal',
        'Micro Club',
        '--scope',
        'read_members',
        '--operation',
        'READ',
      ],
      { routes: routes((body) => (sent = body)) },
    );

    expect(result.exitCode).toBe(0);
    expect(sent).toEqual({
      scopes: ['read_members'],
      operations: { READ: true, SEND_MESSAGES: false, MANAGE_WEBHOOKS: false },
    });
  });

  it('rejects an unknown scope before any request', async () => {
    const result = await runCli(
      ['project', 'access', 'grant', 'Portal', 'Micro Club', '--scope', 'read_everything'],
      { routes: baseRoutes() },
    );

    expect(result.exitCode).toBe(64);
    expect(result.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('rejects an unknown operation before any request', async () => {
    const result = await runCli(
      [
        'project',
        'access',
        'grant',
        'Portal',
        'Micro Club',
        '--scope',
        'read_members',
        '--operation',
        'DELETE_EVERYTHING',
      ],
      { routes: baseRoutes() },
    );

    expect(result.exitCode).toBe(64);
    expect(result.requests.some((r) => r.method === 'PUT')).toBe(false);
  });
});

describe('project create', () => {
  it('rejects JSON without --reveal before creating a project', async () => {
    const result = await runCli(['project', 'create', '--name', 'Portal', '--json'], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
      }),
    });
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('--reveal');
    expect(result.stdout).not.toContain('mcid_live_onceonlykey123');
    expect(result.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('includes the one-time API key in JSON when --reveal is explicit', async () => {
    const result = await runCli(['project', 'create', '--name', 'Portal', '--json', '--reveal'], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('mcid_live_onceonlykey123');
    expect(result.stdout).not.toContain('[REDACTED]');
  });

  it('returns the key and a nonzero exit when setup fails after creation', async () => {
    const result = await runCli(
      [
        'project',
        'create',
        '--name',
        'Portal',
        '--json',
        '--reveal',
        '--server',
        'Micro Club',
        '--redirect-uri',
        'https://example.org/callback',
      ],
      {
        routes: baseRoutes({
          'POST /admin/projects': () =>
            json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
          [`PUT /admin/projects/${PROJECT_ID}/servers/${MAIN_SERVER_ID}`]: () =>
            json({ message: 'access denied' }, 403),
          [`PATCH /admin/projects/${PROJECT_ID}/redirect-uri`]: () =>
            json({ message: 'invalid redirect' }, 400),
        }),
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).apiKey).toBe('mcid_live_onceonlykey123');
    expect(result.stderr).toContain('granting server access failed');
    expect(result.stderr).toContain('redirect URI setup failed');
    expect(result.stderr).not.toContain('mcid_live_onceonlykey123');
  });

  it('does not print server-controlled error text after creation', async () => {
    const secret = 'mcid_live_onceonlykey123';
    const result = await runCli(
      [
        'project',
        'create',
        '--name',
        'Portal',
        '--json',
        '--reveal',
        '--server',
        'Micro Club',
        '--redirect-uri',
        'https://example.org',
      ],
      {
        routes: baseRoutes({
          'POST /admin/projects': () => json({ apiKey: secret, project: projectRecord }, 201),
          [`PUT /admin/projects/${PROJECT_ID}/servers/${MAIN_SERVER_ID}`]: () =>
            json({ message: `unexpected sensitive value ${secret}` }, 400),
          [`PATCH /admin/projects/${PROJECT_ID}/redirect-uri`]: () =>
            json({ message: `unexpected sensitive value ${secret}` }, 400),
        }),
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).apiKey).toBe(secret);
    expect(result.stderr).toContain('granting server access failed');
    expect(result.stderr).not.toContain(secret);
  });

  it('grants the listed servers with every scope by default', async () => {
    const result = await runCli(
      ['project', 'create', '--name', 'Portal', '--server', 'Micro Club', '--json', '--reveal'],
      {
        routes: baseRoutes({
          'POST /admin/projects': () =>
            json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
          [`PUT /admin/projects/${projectRecord.id}/servers/${MAIN_SERVER_ID}`]: () => json({}),
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    const grant = result.requests.find((r) => r.method === 'PUT');
    expect(grant?.path).toBe(`/admin/projects/${projectRecord.id}/servers/${MAIN_SERVER_ID}`);
    // manage_roles is opt-in: a grant without --scope leaves it out.
    expect(grant?.body).toEqual({
      scopes: [
        'read_members',
        'check_permissions',
        'read_inbound_submissions',
        'manage_inbound_webhooks',
      ],
    });
  });

  it('resolves the servers before creating anything', async () => {
    const result = await runCli(
      ['project', 'create', '--name', 'Portal', '--server', 'No Such Server'],
      { routes: baseRoutes() },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('never writes the API key to the config file', async () => {
    const result = await runCli(['project', 'create', '--name', 'Portal'], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
      }),
    });

    expect(result.exitCode).toBe(0);
    const saved = await readFile(configPath(), 'utf8').catch(() => '');
    expect(saved).not.toContain('mcid_live_onceonlykey123');
  });
});
