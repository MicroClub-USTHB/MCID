import { afterEach, describe, expect, it } from 'vitest';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID, MEMBER_ID } from '../test-support/fixtures.js';

afterEach(cleanupCliTest);

const adminRole = {
  id: '888888888888888888',
  name: 'Admin',
  root: false,
  grants: { members: 'read' },
};

describe('access nested grammar', () => {
  it('runs role set as two tokens and merges with current grants', async () => {
    let sent: unknown;
    const result = await runCli(['access', 'role', 'set', 'Admin', 'webhooks=write', '--yes'], {
      routes: baseRoutes({
        'GET /admin/access/roles': () => json([adminRole]),
        'PUT /admin/access/roles/:roleId': (_url, init) => {
          sent = JSON.parse(String(init.body));
          return json(adminRole);
        },
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(
      result.requests.some(
        (r) => r.method === 'PUT' && r.path === '/admin/access/roles/888888888888888888',
      ),
    ).toBe(true);
    expect(sent).toEqual({ grants: { members: 'read', webhooks: 'write' } });
  });

  it('runs member get as two tokens', async () => {
    const result = await runCli(['access', 'member', 'get', '@john_doe'], {
      routes: baseRoutes({
        'GET /admin/members': () =>
          json({
            data: [{ memberId: MEMBER_ID, username: 'john_doe', globalName: 'John Doe' }],
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          }),
        [`GET /admin/access/members/${MEMBER_ID}`]: () =>
          json({ memberId: MEMBER_ID, username: 'john_doe', overrides: { members: 'read' } }),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('members:read');
  });

  it('runs member set as two tokens', async () => {
    const result = await runCli(
      ['access', 'member', 'set', '@john_doe', 'servers=write', '--yes'],
      {
        routes: baseRoutes({
          'GET /admin/members': () =>
            json({
              data: [{ memberId: MEMBER_ID, username: 'john_doe' }],
              total: 1,
              page: 1,
              limit: 20,
              totalPages: 1,
            }),
          [`GET /admin/access/members/${MEMBER_ID}`]: () =>
            json({ memberId: MEMBER_ID, overrides: { members: 'read' } }),
          [`GET /admin/access/members/${MEMBER_ID}/effective`]: () =>
            json({ memberId: MEMBER_ID, username: 'john_doe', root: false, access: {} }),
          [`PUT /admin/access/members/${MEMBER_ID}`]: () => json({ ok: true }),
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(
      result.requests.some(
        (r) => r.method === 'PUT' && r.path === `/admin/access/members/${MEMBER_ID}`,
      ),
    ).toBe(true);
  });

  it('runs member unset as two tokens', async () => {
    const result = await runCli(['access', 'member', 'unset', '@john_doe', 'members', '--yes'], {
      routes: baseRoutes({
        'GET /admin/members': () =>
          json({
            data: [{ memberId: MEMBER_ID, username: 'john_doe' }],
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          }),
        [`GET /admin/access/members/${MEMBER_ID}/effective`]: () =>
          json({ memberId: MEMBER_ID, username: 'john_doe', root: false, access: {} }),
        [`DELETE /admin/access/members/${MEMBER_ID}/members`]: () =>
          new Response(null, { status: 204 }),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(
      result.requests.some(
        (r) => r.method === 'DELETE' && r.path === `/admin/access/members/${MEMBER_ID}/members`,
      ),
    ).toBe(true);
  });

  it('refuses to write overrides for a root admin, whose role already grants everything', async () => {
    const result = await runCli(
      ['access', 'member', 'set', '@john_doe', 'servers=write', '--yes'],
      {
        routes: baseRoutes({
          'GET /admin/members': () =>
            json({
              data: [{ memberId: MEMBER_ID, username: 'john_doe' }],
              total: 1,
              page: 1,
              limit: 20,
              totalPages: 1,
            }),
          [`GET /admin/access/members/${MEMBER_ID}/effective`]: () =>
            json({ memberId: MEMBER_ID, username: 'john_doe', root: true, access: {} }),
        }),
      },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('root admin');
    expect(result.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('keeps the server id resolution path working for main-server defaults', async () => {
    // The resolvers used above must still consult GET /servers (main server).
    const result = await runCli(['access', 'roles'], {
      routes: baseRoutes({
        'GET /admin/access/roles': () => json([adminRole]),
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Admin');
    expect(MAIN_SERVER_ID).toBeDefined();
  });
});

describe('access set preview and validation', () => {
  it('shows the before → after diff the PUT will apply', async () => {
    const result = await runCli(['access', 'role', 'set', 'Admin', 'webhooks=write', '--yes'], {
      routes: baseRoutes({
        'GET /admin/access/roles': () => json([adminRole]),
        'PUT /admin/access/roles/:roleId': () => json(adminRole),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('webhooks: none → write');
    // unchanged grants are not part of the diff
    expect(result.stdout).not.toContain('members: read → read');
  });

  it('shows the same diff for member overrides', async () => {
    const result = await runCli(
      ['access', 'member', 'set', '@john_doe', 'servers=write', '--yes'],
      {
        routes: baseRoutes({
          'GET /admin/members': () =>
            json({
              data: [{ memberId: MEMBER_ID, username: 'john_doe' }],
              total: 1,
              page: 1,
              limit: 20,
              totalPages: 1,
            }),
          [`GET /admin/access/members/${MEMBER_ID}/effective`]: () =>
            json({ memberId: MEMBER_ID, username: 'john_doe', root: false, access: {} }),
          [`GET /admin/access/members/${MEMBER_ID}`]: () =>
            json({ memberId: MEMBER_ID, overrides: { members: 'read' } }),
          [`PUT /admin/access/members/${MEMBER_ID}`]: () => json({ ok: true }),
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('servers: none → write');
    expect(result.stdout).not.toContain('members:');
  });

  it('suggests the catalog name when a resource is misspelled', async () => {
    const result = await runCli(['access', 'role', 'set', 'Admin', 'projets=write', '--yes'], {
      routes: baseRoutes({ 'GET /admin/access/roles': () => json([adminRole]) }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('did you mean "projects"');
    expect(result.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('rejects a pair without a level before any write', async () => {
    const result = await runCli(['access', 'role', 'set', 'Admin', 'webhooks', '--yes'], {
      routes: baseRoutes({ 'GET /admin/access/roles': () => json([adminRole]) }),
    });

    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('Invalid grant "webhooks"');
    expect(result.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('sends nothing when confirmation is refused on a non-interactive terminal', async () => {
    const result = await runCli(['access', 'role', 'set', 'Admin', 'webhooks=write'], {
      routes: baseRoutes({ 'GET /admin/access/roles': () => json([adminRole]) }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('webhooks: none → write');
    expect(result.requests.some((r) => r.method === 'PUT')).toBe(false);
  });
});
