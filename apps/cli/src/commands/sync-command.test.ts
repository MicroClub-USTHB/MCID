import { afterEach, describe, expect, it } from 'vitest';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, MAIN_SERVER_ID } from '../test-support/fixtures.js';

afterEach(cleanupCliTest);

/** SyncChangeDetailsResponseDto: {changes, total}, paged by limit/offset. */
function changesRoute(total = 3) {
  return (url: URL) => {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 100);
    const slice = Array.from({ length: Math.min(limit, total - offset) }, (_, i) => ({
      entityType: 'member',
      entityId: `33333333333333330${offset + i}`,
      action: offset + i === 2 ? 'updated' : 'added',
      entityName: `member_${offset + i + 1}`,
      description: `member_${offset + i + 1}`,
    }));
    return json({ changes: slice, total });
  };
}

describe('sync changes', () => {
  it('pages with limit/offset until every change is read', async () => {
    const result = await runCli(['sync', 'changes', '42'], {
      routes: baseRoutes({
        'GET /admin/sync/logs/:syncLogId/changes': changesRoute(3),
      }),
    });

    expect(result.exitCode).toBe(0);
    const pages = result.requests.filter((r) => r.path === '/admin/sync/logs/42/changes');
    expect(pages.length).toBeGreaterThanOrEqual(1);
    // With the default page size of 100 and 3 rows, one page suffices — but
    // the request must at least declare its page size instead of hoping the
    // server default covers everything.
    expect(pages[0]?.query['limit']).toBeDefined();
    expect(result.stdout).toContain('member_3');
  });

  it('reads past the first 100 changes', async () => {
    const result = await runCli(['sync', 'changes', '42'], {
      routes: baseRoutes({
        'GET /admin/sync/logs/:syncLogId/changes': changesRoute(150),
      }),
    });

    expect(result.exitCode).toBe(0);
    const pages = result.requests.filter((r) => r.path === '/admin/sync/logs/42/changes');
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(result.stdout).toContain('member_150');
  });

  it('sends --type as the action filter', async () => {
    const result = await runCli(['sync', 'changes', '42', '--type', 'added'], {
      routes: baseRoutes({
        'GET /admin/sync/logs/:syncLogId/changes': changesRoute(3),
      }),
    });

    expect(result.exitCode).toBe(0);
    const get = result.requests.find((r) => r.path === '/admin/sync/logs/42/changes');
    expect(get?.query['action']).toBe('added');
  });
});

describe('sync run', () => {
  it('prints the sync log id and the command that follows it', async () => {
    const result = await runCli(['sync', 'run'], {
      routes: baseRoutes({ 'POST /admin/sync/full': () => json({ syncLogId: '4242' }) }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sync log 4242');
    expect(result.stdout).toContain('mcid-cli sync changes 4242');
  });

  it('summarises a sync that finishes under --wait', async () => {
    const result = await runCli(['sync', 'run', '--wait'], {
      routes: baseRoutes({
        'POST /admin/sync/full': () => json({ syncLogId: '4242' }),
        'GET /admin/sync/logs/:syncLogId/changes': () =>
          json({
            total: 4,
            changes: [
              { entityType: 'member', entityId: '1', action: 'added' },
              { entityType: 'member', entityId: '2', action: 'added' },
              { entityType: 'member', entityId: '3', action: 'removed' },
              { entityType: 'role', entityId: '4', action: 'added' },
            ],
          }),
        'GET /admin/sync/status': () =>
          json({
            serverId: MAIN_SERVER_ID,
            status: 'success',
            membersSynced: 1204,
            rolesSynced: 58,
          }),
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Synced .* 1204 members \(\+2, -1\), 58 roles/);
  });

  it('exits non-zero when the sync itself fails under --wait', async () => {
    const result = await runCli(['sync', 'run', '--wait'], {
      routes: baseRoutes({
        'POST /admin/sync/full': () => json({ syncLogId: '4242' }),
        'GET /admin/sync/status': () =>
          json({ serverId: MAIN_SERVER_ID, status: 'failed', membersSynced: 0, rolesSynced: 0 }),
      }),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Sync failed');
  });

  it('exits non-zero when --wait runs out of time', async () => {
    const result = await runCli(['sync', 'run', '--wait', '--timeout', '0'], {
      routes: baseRoutes({
        'POST /admin/sync/full': () => json({ syncLogId: '4242' }),
        'GET /admin/sync/status': () =>
          json({ serverId: MAIN_SERVER_ID, status: 'running', membersSynced: 1, rolesSynced: 0 }),
      }),
    });

    expect(result.exitCode).toBe(6);
    expect(result.stderr).toContain('Sync timed out');
  });
});
