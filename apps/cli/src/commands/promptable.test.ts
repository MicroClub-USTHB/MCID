import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prompts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prompts.js')>();
  return { ...actual, promptIfMissing: vi.fn(async () => 'prompted') };
});

import { emptyConfig, saveConfig } from '../config.js';
import { promptIfMissing } from '../lib/prompts.js';
import { cleanupCliTest, runCli } from '../test-support/cli-harness.js';

const originalTty = process.stdin.isTTY;

afterEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', { value: originalTty, configurable: true });
  vi.mocked(promptIfMissing).mockClear();
  cleanupCliTest();
});

describe('promptable required arguments on a TTY', () => {
  it('fills a missing positional argument from the prompt before running the action', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.mocked(promptIfMissing).mockResolvedValueOnce('Portal');

    const result = await runCli(['project', 'get'], {
      routes: { 'GET /admin/projects': () => new Response(JSON.stringify([])) },
    });

    expect(promptIfMissing).toHaveBeenCalledWith(expect.objectContaining({ flag: '<project>' }));
    expect(result.exitCode).not.toBe(0); // the fake route has no project; the prompt ran first
  });

  it('fills a missing required option from the prompt', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.mocked(promptIfMissing).mockResolvedValueOnce('https://example.test');
    const path = join(await mkdtemp(join(tmpdir(), 'mcid-cli-promptable-')), 'config.json');
    await saveConfig(emptyConfig(), path);

    const result = await runCli(['profile', 'add', 'staging'], {
      env: { MCID_CLI_CONFIG_PATH: path },
    });

    expect(promptIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({ flag: '--base-url <url>' }),
    );
    expect(result.exitCode).toBe(0);
  });
});
