import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addProfile, emptyConfig, saveConfig } from '../config.js';
import { cleanupCliTest, runCli } from '../test-support/cli-harness.js';

afterEach(cleanupCliTest);

describe('missing required arguments in a non-interactive terminal', () => {
  it('dev sso fails with a usage error naming --project before any request', async () => {
    const result = await runCli(['dev', 'sso']);
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('--project <project>');
    expect(result.requests).toEqual([]);
  });

  it('discord-webhook list fails with a usage error naming --project before any request', async () => {
    const result = await runCli(['discord-webhook', 'list']);
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('--project <project>');
    expect(result.requests).toEqual([]);
  });

  it('project get fails with a usage error naming the missing <project> argument', async () => {
    const result = await runCli(['project', 'get']);
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('<project>');
    expect(result.requests).toEqual([]);
  });

  it('profile add fails with a usage error naming --base-url', async () => {
    const result = await runCli(['profile', 'add', 'staging']);
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('--base-url');
  });

  it('webhook create fails with a usage error naming --name before any request', async () => {
    const result = await runCli([
      'webhook',
      'create',
      'schema.json',
      '--profile',
      'prod',
      '--roles',
      '123',
    ]);
    expect(result.exitCode).toBe(64);
    expect(result.stderr).toContain('--name <name>');
    expect(result.requests).toEqual([]);
  });
});

describe('config show --json', () => {
  it('is accepted and prints parseable JSON', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'mcid-cli-tty-')), 'config.json');
    await saveConfig(addProfile(emptyConfig(), 'prod', 'https://mcid.example.com'), path);

    const result = await runCli(['config', 'show', '--json'], {
      env: { MCID_CLI_CONFIG_PATH: path },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      name: 'prod',
      active: true,
      baseUrl: 'https://mcid.example.com',
      session: null,
    });
  });
});
