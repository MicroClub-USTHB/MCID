import { afterEach, describe, expect, it } from 'vitest';
import { CliError, ExitCode } from '../errors.js';
import { confirmAction, confirmDestructive } from './confirm.js';

describe('destructive confirmations', () => {
  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
  const originalIsTTY = stdin.isTTY;

  afterEach(() => {
    Object.defineProperty(stdin, 'isTTY', { configurable: true, value: originalIsTTY });
  });

  it('requires explicit confirmation on non-interactive terminals', async () => {
    Object.defineProperty(stdin, 'isTTY', { configurable: true, value: false });
    await expect(confirmAction('apply changes')).rejects.toMatchObject({
      exitCode: ExitCode.Usage,
      message: expect.stringContaining('pass --yes to confirm'),
    });
    await expect(
      confirmDestructive({ resourceType: 'project', resourceName: 'Demo' }),
    ).rejects.toBeInstanceOf(CliError);
  });

  it('accepts --yes without prompting', async () => {
    Object.defineProperty(stdin, 'isTTY', { configurable: true, value: false });
    expect(await confirmAction('apply changes', true)).toBe(true);
    await expect(
      confirmDestructive({ resourceType: 'project', resourceName: 'Demo', yesFlag: true }),
    ).resolves.toBeUndefined();
  });
});
