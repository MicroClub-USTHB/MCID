import { mkdtemp, readFile, writeFile, chmod, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configPath } from '../config.js';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID, PROJECT_ID, projectRecord } from '../test-support/fixtures.js';
import { expectOwnerOnlyMode } from '../test-support/fs.js';

afterEach(cleanupCliTest);

describe('project list pagination', () => {
  const projects = Array.from({ length: 35 }, (_, index) => ({
    ...projectRecord,
    id: `project-${index + 1}`,
    name: `Project ${index + 1}`,
  }));

  const routes = baseRoutes({
    'GET /admin/projects': () => json(projects),
  });

  it('shows the first 30 projects by default', async () => {
    const result = await runCli(['project', 'list', '--json'], { routes });

    const output = JSON.parse(result.stdout) as { id: string }[];

    expect(result.exitCode).toBe(0);
    expect(output).toHaveLength(30);
    expect(output[0]?.id).toBe('project-1');
    expect(output[29]?.id).toBe('project-30');
    expect(result.stderr).toContain('Showing 1-30 of 35');
  });

  it('shows the requested page and limit', async () => {
    const result = await runCli(['project', 'list', '--limit', '5', '--page', '2', '--json'], {
      routes,
    });

    const output = JSON.parse(result.stdout) as { id: string }[];

    expect(result.exitCode).toBe(0);
    expect(output.map((project) => project.id)).toEqual([
      'project-6',
      'project-7',
      'project-8',
      'project-9',
      'project-10',
    ]);
    expect(result.stderr).toContain('Showing 6-10 of 35');
  });

  it('shows every project when --all is provided', async () => {
    const result = await runCli(['project', 'list', '--all', '--json'], { routes });

    const output = JSON.parse(result.stdout) as { id: string }[];

    expect(result.exitCode).toBe(0);
    expect(output).toHaveLength(35);
    expect(output[0]?.id).toBe('project-1');
    expect(output[34]?.id).toBe('project-35');
    expect(result.stderr).toBe('');
  });
});

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

  it('writes --env-out with JSON and retains the one-time key in output', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-json-create-'));
    const target = join(tmp, '.env');
    const result = await runCli(
      ['project', 'create', '--name', 'Portal', '--json', '--reveal', '--env-out', target],
      {
        routes: baseRoutes({
          'POST /admin/projects': () =>
            json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
        }),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).apiKey).toBe('mcid_live_onceonlykey123');
    expect(await readFile(target, 'utf8')).toContain('MCID_API_KEY=mcid_live_onceonlykey123');
    await expectOwnerOnlyMode(target);
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

  it('rejects an existing key before sending the create request', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-preflight-'));
    const target = join(tmp, '.env');
    await writeFile(target, 'MCID_API_KEY=old\n', { mode: 0o600 });
    const result = await runCli(['project', 'create', '--name', 'Portal', '--env-out', target], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
      }),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.requests.some((r) => r.method === 'POST')).toBe(false);
    expect(await readFile(target, 'utf8')).toBe('MCID_API_KEY=old\n');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects an insecure or symlinked env file before creating a project',
    async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'mcid-preflight-'));
      const target = join(tmp, '.env');
      await writeFile(target, 'OTHER=value\n', { mode: 0o600 });
      await chmod(target, 0o644);
      const insecure = await runCli(['project', 'create', '--name', 'Portal', '--env-out', target]);
      expect(insecure.exitCode).not.toBe(0);
      expect(insecure.requests.some((r) => r.method === 'POST')).toBe(false);
      const link = join(tmp, 'link');
      await symlink(target, link);
      const linked = await runCli(['project', 'create', '--name', 'Portal', '--env-out', link]);
      expect(linked.exitCode).not.toBe(0);
      expect(linked.requests.some((r) => r.method === 'POST')).toBe(false);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a hard-linked env file before creation',
    async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'mcid-hardlink-'));
      const target = join(tmp, '.env');
      const other = join(tmp, 'other');
      await writeFile(target, 'OTHER=value\n', { mode: 0o600 });
      await link(target, other);
      const result = await runCli(['project', 'create', '--name', 'Portal', '--env-out', target], {
        routes: baseRoutes({
          'POST /admin/projects': () =>
            json({ apiKey: 'one-time-key', project: projectRecord }, 201),
        }),
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.requests.some((r) => r.method === 'POST')).toBe(false);
      expect(await readFile(other, 'utf8')).toBe('OTHER=value\n');
    },
  );

  it.skipIf(process.platform === 'win32')('rejects a hard link added after preflight', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-hardlink-race-'));
    const target = join(tmp, '.env');
    const other = join(tmp, 'other');
    await writeFile(target, 'OTHER=value\n', { mode: 0o600 });
    const result = await runCli(
      ['project', 'create', '--name', 'Portal', '--json', '--reveal', '--env-out', target],
      {
        routes: baseRoutes({
          'POST /admin/projects': async () => {
            await link(target, other);
            return json({ apiKey: 'one-time-key', project: projectRecord }, 201);
          },
        }),
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).apiKey).toBe('one-time-key');
    expect(await readFile(other, 'utf8')).toBe('OTHER=value\n');
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

  it('returns the key and fails if the env destination appears after preflight', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-race-'));
    const target = join(tmp, '.env');
    const result = await runCli(
      ['project', 'create', '--name', 'Portal', '--json', '--reveal', '--env-out', target],
      {
        routes: baseRoutes({
          'POST /admin/projects': async () => {
            await writeFile(target, 'RACE=do-not-overwrite\n', { mode: 0o600 });
            return json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201);
          },
        }),
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).apiKey).toBe('mcid_live_onceonlykey123');
    expect(result.stderr).not.toContain('mcid_live_onceonlykey123');
    expect(await readFile(target, 'utf8')).toBe('RACE=do-not-overwrite\n');
  });

  it('refuses to overwrite a changed existing file and still returns the new key', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-change-'));
    const target = join(tmp, '.env');
    await writeFile(target, 'OTHER=old\n', { mode: 0o600 });
    const result = await runCli(
      ['project', 'create', '--name', 'Portal', '--json', '--reveal', '--env-out', target],
      {
        routes: baseRoutes({
          'POST /admin/projects': async () => {
            await writeFile(target, 'OTHER=changed\n', { mode: 0o600 });
            return json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201);
          },
        }),
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout).apiKey).toBe('mcid_live_onceonlykey123');
    expect(result.stderr).toContain('Project was created');
    expect(await readFile(target, 'utf8')).toBe('OTHER=changed\n');
  });

  it('updates an existing private env file when --force is specified', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-force-'));
    const target = join(tmp, '.env');
    await writeFile(target, 'OTHER=value\nMCID_API_KEY=old\n', { mode: 0o600 });
    const result = await runCli(
      [
        'project',
        'create',
        '--name',
        'Portal',
        '--json',
        '--reveal',
        '--env-out',
        target,
        '--force',
      ],
      {
        routes: baseRoutes({
          'POST /admin/projects': () =>
            json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
        }),
      },
    );
    expect(result.exitCode).toBe(0);
    expect(await readFile(target, 'utf8')).toBe(
      'OTHER=value\nMCID_API_KEY=mcid_live_onceonlykey123\n',
    );
    await expectOwnerOnlyMode(target);
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

  it('writes the --env-out with mode 0600', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-create-'));
    const target = join(tmp, '.env');

    const result = await runCli(['project', 'create', '--name', 'Portal', '--env-out', target], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_onceonlykey123', project: projectRecord }, 201),
      }),
    });

    expect(result.exitCode).toBe(0);
    await expectOwnerOnlyMode(target);
  });

  it('refuses to overwrite an env file that already holds a key without --force', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-create-'));
    const target = join(tmp, '.env');

    const result = await runCli(['project', 'create', '--name', 'Portal', '--env-out', target], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_secondkey456', project: projectRecord }, 201),
      }),
    });

    // Second create into the same file: the guard must reject before overwrite.
    const second = await runCli(['project', 'create', '--name', 'Portal', '--env-out', target], {
      routes: baseRoutes({
        'POST /admin/projects': () =>
          json({ apiKey: 'mcid_live_secondkey456', project: projectRecord }, 201),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(second.exitCode).not.toBe(0);
    expect(second.stderr).toContain('--force');
  });
});
