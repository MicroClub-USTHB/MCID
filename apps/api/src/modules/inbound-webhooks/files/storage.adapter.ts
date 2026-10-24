import type { Readable } from 'stream';

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

/**
 * Where uploaded files live. The rest of the module knows only this, so the
 * backend (S3 or MinIO today) can change without touching the upload flow.
 */
export interface StorageAdapter {
  exists(key: string): Promise<boolean>;
  /** `size` is the exact byte length of `body`. */
  put(key: string, body: Readable, size: number): Promise<void>;
  /** Deleting a key that does not exist is not an error. */
  delete(key: string): Promise<void>;
}
