import { afterEach, describe, expect, it } from 'vitest';
import { cleanupCliTest, runCli } from '../test-support/cli-harness.js';

afterEach(cleanupCliTest);

describe('list output validation', () => {
  it.each([
    ['project', 'list'],
    ['server', 'list'],
    ['role', 'list'],
    ['member', 'list'],
    ['sync', 'logs'],
    ['webhook', 'list'],
    ['discord-webhook', 'list', '--project', 'Portal'],
  ])('rejects an unknown output format for %s %s', async (...command) => {
    const result = await runCli([...command, '-o', 'xml']);
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('--output');
    expect(result.requests).toHaveLength(0);
  });
});

describe('list format conflicts', () => {
  it.each([
    ['project', 'list'],
    ['member', 'list'],
    ['sync', 'logs'],
    ['webhook', 'list'],
    ['discord-webhook', 'list', '--project', 'Portal'],
  ])('rejects conflicting JSON and CSV flags for %s %s', async (...command) => {
    const result = await runCli([...command, '--json', '-o', 'csv']);
    expect(result.exitCode).toBe(64);
    expect(result.requests).toHaveLength(0);
  });
});
