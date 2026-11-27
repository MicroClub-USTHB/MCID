import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliError, ExitCode } from '../errors.js';
import {
  promptIfMissing,
  type PromptIfMissingDeps,
  type PromptInputOptions,
  type PromptSelectOptions,
} from './prompts.js';
import { cleanupCliTest } from '../test-support/cli-harness.js';

const originalTty = process.stdin.isTTY;

function setTty(value: boolean | undefined): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
}

function fakeDeps() {
  const input = vi.fn(async (_options: PromptInputOptions) => '');
  const select = vi.fn(async (_options: PromptSelectOptions<string>) => '');
  const deps: PromptIfMissingDeps = {
    input,
    select: select as PromptIfMissingDeps['select'],
  };
  return { input, select, deps };
}

afterEach(() => {
  setTty(originalTty);
  cleanupCliTest();
});

describe('promptIfMissing', () => {
  it('returns a supplied argument without prompting', async () => {
    setTty(true);
    const { input, select, deps } = fakeDeps();
    await expect(
      promptIfMissing({ value: 'Portal', flag: '--project <project>', message: 'Project', deps }),
    ).resolves.toBe('Portal');
    expect(input).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('fails with a usage error naming the flag when stdin is not a TTY', async () => {
    setTty(false);
    const { select, deps } = fakeDeps();
    let thrown: unknown;
    try {
      await promptIfMissing({
        value: undefined,
        flag: '--project <project>',
        message: 'Project',
        choices: async () => [{ name: 'Portal', value: 'p1' }],
        deps,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).exitCode).toBe(ExitCode.Usage);
    expect((thrown as CliError).message).toContain('--project <project>');
    expect(select).not.toHaveBeenCalled();
  });

  it('asks for free text on a TTY', async () => {
    setTty(true);
    const { input, select, deps } = fakeDeps();
    input.mockResolvedValueOnce('Webhook name');
    await expect(
      promptIfMissing({ value: '', flag: '--name <name>', message: 'Webhook name', deps }),
    ).resolves.toBe('Webhook name');
    expect(input).toHaveBeenCalledWith(expect.objectContaining({ message: 'Webhook name' }));
    expect(select).not.toHaveBeenCalled();
  });

  it('uses a searchable picker when choices are given', async () => {
    setTty(true);
    const { input, select, deps } = fakeDeps();
    select.mockResolvedValueOnce('p2');
    const choices = [
      { name: 'Portal', value: 'p1' },
      { name: 'Hackathon', value: 'p2' },
    ];
    await expect(
      promptIfMissing({
        value: undefined,
        flag: '--project <project>',
        message: 'Project',
        choices,
        deps,
      }),
    ).resolves.toBe('p2');
    expect(select).toHaveBeenCalledWith({ message: 'Project', choices });
    expect(input).not.toHaveBeenCalled();
  });

  it('does not prompt when only one choice exists', async () => {
    setTty(true);
    const { select, deps } = fakeDeps();
    await expect(
      promptIfMissing({
        value: undefined,
        flag: '--project <project>',
        message: 'Project',
        choices: [{ name: 'Portal', value: 'p1' }],
        deps,
      }),
    ).resolves.toBe('p1');
    expect(select).not.toHaveBeenCalled();
  });

  it('fails when there are no choices to pick from', async () => {
    setTty(true);
    const { deps } = fakeDeps();
    let thrown: unknown;
    try {
      await promptIfMissing({
        value: undefined,
        flag: '--project <project>',
        message: 'Project',
        choices: [],
        deps,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).exitCode).toBe(ExitCode.NotFound);
  });
});
