import { afterEach, describe, expect, it } from 'vitest';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID } from '../test-support/fixtures.js';

afterEach(cleanupCliTest);

const ROLE_ID = '777777777777777777';

/** The impact endpoint is read before anything is written; `permissions` applies. */
function roleRoutes() {
  return baseRoutes({
    'GET /admin/stats/roles': () => json([{ roleId: ROLE_ID, roleName: 'Mods', memberCount: 12 }]),
    [`POST /permissions/admin/servers/${MAIN_SERVER_ID}/roles/${ROLE_ID}/impact`]: () =>
      json({ affectedMembersCount: 37 }),
    [`POST /permissions/admin/servers/${MAIN_SERVER_ID}/roles/${ROLE_ID}/permissions`]: () =>
      json({ ok: true }, 201),
  });
}

const applyPath = `/permissions/admin/servers/${MAIN_SERVER_ID}/roles/${ROLE_ID}/permissions`;

describe('role permissions add', () => {
  it('previews the impact, then applies when --yes is passed', async () => {
    const result = await runCli(['role', 'permissions', 'add', 'Mods', '42', '--yes'], {
      routes: roleRoutes(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('37');
    expect(result.requests.some((r) => r.method === 'POST' && r.path === applyPath)).toBe(true);
  });

  it('prints the preview and applies nothing on --dry-run', async () => {
    const result = await runCli(['role', 'permissions', 'add', 'Mods', '42', '--dry-run'], {
      routes: roleRoutes(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('37');
    expect(result.stdout.toLowerCase()).toContain('dry run');
    expect(result.requests.some((r) => r.path === applyPath)).toBe(false);
  });

  it('applies nothing without confirmation on a non-interactive terminal', async () => {
    const result = await runCli(['role', 'permissions', 'add', 'Mods', '42'], {
      routes: roleRoutes(),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('37');
    expect(result.requests.some((r) => r.path === applyPath)).toBe(false);
  });
});

describe('role list', () => {
  it('renders the server role rows the panel uses', async () => {
    const result = await runCli(['role', 'list'], { routes: roleRoutes() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Mods');
  });
});
