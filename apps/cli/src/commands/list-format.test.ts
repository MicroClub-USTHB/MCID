import type { Command } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProgram, cleanupCliTest, runCli } from '../test-support/cli-harness.js';

afterEach(cleanupCliTest);

describe('list command surface', () => {
  it('every visible list command has paging, quiet, csv and json flags', () => {
    const problems: string[] = [];
    const walk = (command: Command, path: string): void => {
      const full = path ? `${path} ${command.name()}` : command.name();
      if (command.name() === 'list' || command.name() === 'ls') {
        const flags = new Set(
          command.options.flatMap((option) =>
            [option.long, option.short].filter((flag): flag is string => Boolean(flag)),
          ),
        );
        for (const flag of ['--limit', '--page', '--all', '-q', '-o', '--json']) {
          if (!flags.has(flag)) problems.push(`${full} missing ${flag}`);
        }
      }
      for (const child of command.commands) walk(child, full);
    };
    walk(buildProgram(), '');
    expect(problems).toEqual([]);
  });
});

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
