import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, WEBHOOK_ID } from '../test-support/fixtures.js';

afterEach(() => {
  vi.useRealTimers();
  cleanupCliTest();
});

describe('webhook settings set', () => {
  it('sends defaultReaderRoleIds (the DTO field) and succeeds', async () => {
    const result = await runCli(
      ['webhook', 'settings', 'set', '--reader-role', '123456789012345678'],
      {
        routes: baseRoutes({
          'PUT /admin/inbound-webhooks/settings': () =>
            json({ defaultReaderRoleIds: ['123456789012345678'] }),
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    const put = result.requests.find((r) => r.path === '/admin/inbound-webhooks/settings');
    expect(put?.body).toEqual({ defaultReaderRoleIds: ['123456789012345678'] });
  });
});

describe('webhook submissions', () => {
  it('converts --since durations to an ISO dateFrom', async () => {
    const result = await runCli(['webhook', 'submissions', 'contact-form', '--since', '24h'], {
      routes: baseRoutes({
        [`GET /inbound-webhooks/${WEBHOOK_ID}/submissions`]: () =>
          json({ submissions: [], total: 0, limit: 30, offset: 0 }),
      }),
    });

    expect(result.exitCode).toBe(0);
    const get = result.requests.find(
      (r) => r.path === `/inbound-webhooks/${WEBHOOK_ID}/submissions`,
    );
    const dateFrom = String(get?.query['dateFrom']);
    expect(dateFrom).not.toBe('24h');
    expect(Number.isNaN(Date.parse(dateFrom))).toBe(false);
  });
});

describe('webhook submissions export (nested grammar)', () => {
  it('runs the export when invoked as two tokens: submissions export <webhook>', async () => {
    const target = join(await mkdtemp(join(tmpdir(), 'mcid-export-')), 'subs.csv');
    const result = await runCli(
      ['webhook', 'submissions', 'export', 'contact-form', '--file', target],
      {
        routes: baseRoutes({
          [`GET /inbound-webhooks/${WEBHOOK_ID}/submissions`]: () =>
            json({ submissions: [], total: 0, limit: 200, offset: 0 }),
        }),
      },
    );

    // The export action ran (submissions endpoint hit, file written), and
    // "export" was not treated as a webhook name.
    expect(result.exitCode).toBe(0);
    expect(
      result.requests.some((r) => r.path === `/inbound-webhooks/${WEBHOOK_ID}/submissions`),
    ).toBe(true);
    expect(result.stdout).toContain('Exported');
  });
});

describe('webhook watch', () => {
  const row = (id: string, name: string) => ({
    id,
    receivedAt: '2026-10-27T10:00:00.000Z',
    data: { name },
  });

  /** Polls return the given pages in order; the last page repeats. */
  function pollingRoutes(pages: unknown[][]) {
    let call = 0;
    return baseRoutes({
      [`GET /inbound-webhooks/${WEBHOOK_ID}/submissions`]: () =>
        json({ submissions: pages[Math.min(call++, pages.length - 1)] }),
    });
  }

  /** Everything written to stdout after the command returned (the poll output). */
  const written = () =>
    vi
      .mocked(process.stdout.write)
      .mock.calls.map(([chunk]) => String(chunk))
      .join('');

  it('prints only new submissions as NDJSON, never repeating one it has seen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const a = row('sub-a', 'Ada');
    const b = row('sub-b', 'Bob');
    await runCli(['webhook', 'watch', 'contact-form', '--json'], {
      routes: pollingRoutes([[a], [a, b], [a, b]]),
    });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    const lines = written()
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as { id: string });
    expect(lines.map((l) => l.id)).toEqual(['sub-b']);
  });

  it('prints a compact row with the first fields when not streaming JSON', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await runCli(['webhook', 'watch', 'contact-form'], {
      routes: pollingRoutes([[], [row('sub-c', 'Cy')]]),
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(written()).toContain('sub-c');
    expect(written()).toContain('Cy');
  });
});
