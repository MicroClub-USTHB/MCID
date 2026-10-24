import { ServiceUnavailableException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { S3StorageAdapter } from './s3.storage';

const configured = {
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_ENDPOINT: 'http://minio:9000',
} as Record<string, string>;

const adapter = (env: Record<string, string>) =>
  new S3StorageAdapter({
    get: (name: string) => env[name],
    getOrThrow: (name: string) => env[name],
  } as never);

describe('S3StorageAdapter', () => {
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('answers 503 while storage is not configured', async () => {
    await expect(adapter({}).exists('k')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('reports an object that exists, and one that does not', async () => {
    const s3 = adapter(configured);
    await expect(s3.exists('k')).resolves.toBe(true);

    send.mockRejectedValueOnce(
      Object.assign(new Error('x'), { name: 'NotFound' }),
    );
    await expect(s3.exists('k')).resolves.toBe(false);
  });

  it('does not hide other storage errors', async () => {
    send.mockRejectedValueOnce(new Error('boom'));
    await expect(adapter(configured).exists('k')).rejects.toThrow('boom');
  });

  it('puts with the exact length and deletes by key', async () => {
    const s3 = adapter(configured);
    await s3.put('files/a', Readable.from(['abc']), 3);
    await s3.delete('files/a');

    const [put, del] = send.mock.calls.map(
      ([command]) => command.input as Record<string, unknown>,
    );
    expect(put).toMatchObject({
      Bucket: 'bucket',
      Key: 'files/a',
      ContentLength: 3,
    });
    expect(del).toMatchObject({ Bucket: 'bucket', Key: 'files/a' });
  });
});
