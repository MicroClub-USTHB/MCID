import { afterEach, describe, expect, it } from 'vitest';
import { baseRoutes, MAIN_SERVER_ID } from '../test-support/fixtures.js';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';

afterEach(cleanupCliTest);

describe('--json keeps public key fields', () => {
  it('access catalog does not redact its level and resource keys', async () => {
    const result = await runCli(['access', 'catalog', '--json'], {
      routes: baseRoutes({
        'GET /admin/access/catalog': () =>
          json({
            levels: [{ key: 'read', description: 'Read' }],
            resources: [{ key: 'projects' }],
          }),
      }),
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.levels[0].key).toBe('read');
    expect(parsed.resources[0].key).toBe('projects');
  });

  it('role get does not redact permission keys', async () => {
    const result = await runCli(['role', 'get', 'Lead', '--json'], {
      routes: baseRoutes({
        'GET /admin/stats/roles': () =>
          json([{ roleId: 'role-1', roleName: 'Lead', memberCount: 1 }]),
        [`GET /permissions/admin/servers/${MAIN_SERVER_ID}/roles/role-1/permissions`]: () =>
          json({ permissions: [{ id: 1, key: 'projects.read', description: 'Read projects' }] }),
      }),
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.permissions[0].key).toBe('projects.read');
  });
});
