import { afterEach, describe, expect, it } from 'vitest';
import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';

afterEach(cleanupCliTest);

const baseMe = {
  id: '123456789012345678',
  username: 'john_doe',
  globalName: 'John Doe',
  displayName: null,
  preferredName: null,
  sessionExpiresAt: '2026-12-01T00:00:00.000Z',
};

describe('whoami', () => {
  it('shows the caller’s effective access levels', async () => {
    const result = await runCli(['whoami'], {
      routes: {
        'GET /auth/admin/me': () =>
          json({
            ...baseMe,
            root: false,
            permissions: { projects: 'write', members: 'manage' },
          }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Logged in as John Doe (john_doe)');
    expect(result.stdout).toMatch(/projects\s+write/);
    expect(result.stdout).toMatch(/members\s+manage/);
  });

  it('says root when the caller holds the root role', async () => {
    const result = await runCli(['whoami'], {
      routes: {
        'GET /auth/admin/me': () =>
          json({ ...baseMe, root: true, permissions: { projects: 'manage' } }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('root');
  });

  it('stays quiet when an older API omits the levels', async () => {
    const result = await runCli(['whoami'], {
      routes: { 'GET /auth/admin/me': () => json(baseMe) },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Effective access');
  });
});
