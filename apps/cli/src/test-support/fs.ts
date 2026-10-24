import { stat } from 'node:fs/promises';
import { expect } from 'vitest';

/**
 * Asserts the file is owner-only (0600).
 *
 * Windows has no POSIX mode bits, so the check is enforced on POSIX hosts
 * (i.e. CI) and is a no-op elsewhere. The caller can still assert existence
 * and content on every platform.
 */
export async function expectOwnerOnlyMode(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  expect((await stat(path)).mode & 0o777).toBe(0o600);
}
