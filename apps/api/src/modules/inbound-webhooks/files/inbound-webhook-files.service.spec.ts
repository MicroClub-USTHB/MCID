import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { InboundWebhookFilesService } from './inbound-webhook-files.service';
import { sniffMime } from './mime-sniffer';

// file-type is ESM-only, which Jest's CommonJS runtime cannot load
jest.mock('./mime-sniffer', () => ({ sniffMime: jest.fn() }));

const BOUNDARY = 'testboundary';

/** A multipart request carrying `parts`, shaped like the Express one. */
function multipart(parts: { name: string; filename: string; body: Buffer }[]) {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      p.body,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Object.assign(Readable.from([Buffer.concat(chunks)]), {
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
}

const webhook = (maxSizeBytes = 1000) =>
  ({
    id: 'wh-1',
    schema: {
      version: 1,
      fields: [
        {
          key: 'cv',
          type: 'file',
          accept: ['application/pdf'],
          maxSizeBytes,
        },
      ],
    },
  }) as never;

describe('InboundWebhookFilesService', () => {
  let repository: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let service: InboundWebhookFilesService;
  const sniff = sniffMime as jest.Mock;

  beforeEach(() => {
    sniff.mockReset().mockResolvedValue('application/pdf');
    repository = {
      insertFile: jest.fn((data) => Promise.resolve({ id: 'file-1', ...data })),
      findExpiredPendingFiles: jest.fn(),
      findReferencedStorageKeys: jest.fn(),
      // Runs `fn` straight away, handing it a stand-in transaction
      withStorageKeyLock: jest.fn((_key: string, fn: (tx: string) => unknown) =>
        fn('tx'),
      ),
      deletePendingFiles: jest.fn((ids: string[]) =>
        Promise.resolve(ids.length),
      ),
    };
    storage = {
      assertReady: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new InboundWebhookFilesService(
      repository as never,
      storage as never,
      { get: (_name: string, fallback: unknown) => fallback } as never,
    );
  });

  describe('receive', () => {
    const pdf = Buffer.from('%PDF-1.7 hello');

    it('stores the file under its hash and returns the token', async () => {
      const result = await service.receive(
        webhook(),
        multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
      );

      expect(result).toMatchObject({
        fileId: 'file-1',
        size: pdf.length,
        mime: 'application/pdf',
      });
      expect(result.sha256).toHaveLength(64);
      expect(storage.put).toHaveBeenCalledWith(
        `files/${result.sha256}`,
        expect.anything(),
        pdf.length,
      );
      expect(repository.insertFile).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: 'wh-1',
          originalName: 'cv.pdf',
          storageKey: `files/${result.sha256}`,
        }),
        'tx',
      );
      // The default TTL is one hour
      const { expiresAt } = repository.insertFile.mock.calls[0][0] as {
        expiresAt: Date;
      };
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(3_500_000);
    });

    it('does not store the same content twice', async () => {
      storage.exists.mockResolvedValue(true);
      await service.receive(
        webhook(),
        multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
      );
      expect(storage.put).not.toHaveBeenCalled();
      expect(repository.insertFile).toHaveBeenCalled();
    });

    it('rejects content whose real type is not accepted, whatever it is named', async () => {
      sniff.mockResolvedValue('application/x-elf');
      await expect(
        service.receive(
          webhook(),
          multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
        ),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      expect(storage.put).not.toHaveBeenCalled();
      expect(repository.insertFile).not.toHaveBeenCalled();
    });

    it('rejects content with no recognizable signature', async () => {
      sniff.mockResolvedValue(undefined);
      await expect(
        service.receive(
          webhook(),
          multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
        ),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('stops at the size cap while streaming, storing nothing', async () => {
      await expect(
        service.receive(
          webhook(100),
          multipart([
            { name: 'file', filename: 'big.pdf', body: Buffer.alloc(5000, 1) },
          ]),
        ),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(storage.put).not.toHaveBeenCalled();
      expect(repository.insertFile).not.toHaveBeenCalled();
    });

    it('refuses on a Content-Length far past the cap without reading the body', async () => {
      const req = multipart([{ name: 'file', filename: 'a.pdf', body: pdf }]);
      req.headers['content-length'] = String(10 * 1024 * 1024);
      await expect(service.receive(webhook(100), req)).rejects.toThrow(
        PayloadTooLargeException,
      );
      expect(req.readableDidRead).toBe(false);
    });

    it('reads the type from the stored file, not from a prefix of it', async () => {
      await service.receive(
        webhook(),
        multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
      );
      expect(sniff).toHaveBeenCalledWith(expect.stringContaining('iwf-'));
    });

    it('answers before reading the body when storage is not configured', async () => {
      storage.assertReady.mockImplementation(() => {
        throw new ServiceUnavailableException('File storage is not configured');
      });
      const req = multipart([{ name: 'file', filename: 'a.pdf', body: pdf }]);
      await expect(service.receive(webhook(), req)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(req.readableDidRead).toBe(false);
    });

    it("checks the object and inserts the row under the key's lock, on one transaction", async () => {
      const result = await service.receive(
        webhook(),
        multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
      );
      expect(repository.withStorageKeyLock).toHaveBeenCalledWith(
        `files/${result.sha256}`,
        expect.any(Function),
      );
      expect(repository.insertFile).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: `files/${result.sha256}` }),
        'tx',
      );
    });

    it.each(['', 'soon', '0', '-3'])(
      'falls back to one hour for a TTL of %p',
      async (ttl) => {
        service = new InboundWebhookFilesService(
          repository as never,
          storage as never,
          { get: () => ttl } as never,
        );
        await service.receive(
          webhook(),
          multipart([{ name: 'file', filename: 'cv.pdf', body: pdf }]),
        );
        const { expiresAt } = repository.insertFile.mock.calls[0][0] as {
          expiresAt: Date;
        };
        expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(3_500_000);
        expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
      },
    );

    it('rejects a second file', async () => {
      await expect(
        service.receive(
          webhook(),
          multipart([
            { name: 'a', filename: 'a.pdf', body: pdf },
            { name: 'b', filename: 'b.pdf', body: pdf },
          ]),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(repository.insertFile).not.toHaveBeenCalled();
    });

    it('rejects an empty file and a body with no file', async () => {
      await expect(
        service.receive(
          webhook(),
          multipart([
            { name: 'file', filename: 'e.pdf', body: Buffer.alloc(0) },
          ]),
        ),
      ).rejects.toThrow('empty');
      await expect(service.receive(webhook(), multipart([]))).rejects.toThrow(
        'No file',
      );
    });

    it('rejects a body that is not multipart', async () => {
      const req = Object.assign(Readable.from(['{}']), {
        headers: { 'content-type': 'application/json' },
      });
      await expect(service.receive(webhook(), req)).rejects.toThrow(
        'multipart',
      );
    });

    it('rejects an upload to a webhook with no file field', async () => {
      const flat = {
        id: 'wh-2',
        schema: { version: 1, fields: [{ key: 'n', type: 'string' }] },
      } as never;
      await expect(service.receive(flat, multipart([]))).rejects.toThrow(
        'no file fields',
      );
    });
  });

  describe('sweepExpired', () => {
    const row = (id: string, storageKey: string) => ({ id, storageKey });

    it('does nothing when nothing expired', async () => {
      repository.findExpiredPendingFiles.mockResolvedValue([]);
      expect(await service.sweepExpired()).toBe(0);
      expect(storage.delete).not.toHaveBeenCalled();
      expect(repository.deletePendingFiles).not.toHaveBeenCalled();
    });

    it('deletes the object of an orphan, but keeps one other rows still use', async () => {
      repository.findExpiredPendingFiles.mockResolvedValue([
        row('1', 'files/a'),
        row('2', 'files/a'),
        row('3', 'files/b'),
      ]);
      repository.findReferencedStorageKeys.mockResolvedValue(
        new Set(['files/b']),
      );

      expect(await service.sweepExpired()).toBe(3);
      // Each key is checked under its own lock, ignoring the rows being swept
      expect(repository.withStorageKeyLock).toHaveBeenCalledWith(
        'files/a',
        expect.any(Function),
      );
      expect(repository.findReferencedStorageKeys).toHaveBeenCalledWith(
        ['files/a'],
        ['1', '2', '3'],
        'tx',
      );
      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith('files/a');
      expect(repository.deletePendingFiles).toHaveBeenCalledWith([
        '1',
        '2',
        '3',
      ]);
    });

    it('keeps the rows of an object it could not delete, to retry next sweep', async () => {
      repository.findExpiredPendingFiles.mockResolvedValue([
        row('1', 'files/a'),
        row('2', 'files/b'),
      ]);
      repository.findReferencedStorageKeys.mockResolvedValue(new Set());
      storage.delete.mockRejectedValueOnce(new Error('s3 down'));

      await expect(service.sweepExpired()).resolves.toBe(1);
      expect(storage.delete).toHaveBeenCalledTimes(2);
      expect(repository.deletePendingFiles).toHaveBeenCalledWith(['2']);
    });
  });

  describe('sweep schedule', () => {
    afterEach(() => {
      service.stopSweepSchedule();
      jest.useRealTimers();
    });

    it('runs the sweep on an interval, once however often it is started', async () => {
      jest.useFakeTimers();
      repository.findExpiredPendingFiles.mockResolvedValue([]);

      service.startSweepSchedule();
      service.startSweepSchedule();
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(repository.findExpiredPendingFiles).toHaveBeenCalledTimes(1);

      service.stopSweepSchedule();
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(repository.findExpiredPendingFiles).toHaveBeenCalledTimes(1);
    });
  });
});
