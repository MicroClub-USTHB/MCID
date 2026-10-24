import { Logger } from '@nestjs/common';
import { InboundWebhookRetentionService } from './inbound-webhook-retention.service';

const NOW = new Date('2026-06-01T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('InboundWebhookRetentionService', () => {
  let repository: Record<string, jest.Mock>;
  let storage: Record<string, jest.Mock>;
  let service: InboundWebhookRetentionService;
  let log: jest.SpyInstance;

  const build = (retentionDays?: unknown) => {
    service = new InboundWebhookRetentionService(
      repository as never,
      storage as never,
      {
        get: (name: string, fallback: unknown) =>
          name === 'INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS' &&
          retentionDays !== undefined
            ? retentionDays
            : fallback,
      } as never,
    );
  };

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    repository = {
      deleteExpiredDrafts: jest.fn().mockResolvedValue(0),
      findSubmissionsReceivedBefore: jest.fn().mockResolvedValue([]),
      findFilesOfSubmissions: jest.fn().mockResolvedValue([]),
      findReferencedStorageKeys: jest.fn().mockResolvedValue(new Set()),
      deleteSubmissions: jest.fn((ids: string[]) =>
        Promise.resolve(ids.length),
      ),
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
    build();
  });

  afterEach(() => jest.restoreAllMocks());

  it('sweeps expired drafts and logs every count', async () => {
    repository.deleteExpiredDrafts.mockResolvedValue(4);

    const counts = await service.runCleanup(NOW);

    expect(repository.deleteExpiredDrafts).toHaveBeenCalledWith(NOW);
    expect(counts).toEqual({ drafts: 4, submissions: 0, files: 0 });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('4 expired drafts'),
    );
  });

  it('cuts off at 365 days by default and at the configured number otherwise', async () => {
    await service.runCleanup(NOW);
    expect(repository.findSubmissionsReceivedBefore.mock.calls[0][0]).toEqual(
      new Date(NOW.getTime() - 365 * DAY),
    );

    build('30');
    await service.runCleanup(NOW);
    expect(repository.findSubmissionsReceivedBefore.mock.calls[1][0]).toEqual(
      new Date(NOW.getTime() - 30 * DAY),
    );
  });

  it.each(['', 'soon', '0', '-5'])(
    'falls back to 365 days for %p rather than deleting everything',
    async (value) => {
      build(value);
      await service.runCleanup(NOW);
      expect(repository.findSubmissionsReceivedBefore.mock.calls[0][0]).toEqual(
        new Date(NOW.getTime() - 365 * DAY),
      );
    },
  );

  it('deletes a submission with its objects and its draft', async () => {
    repository.findSubmissionsReceivedBefore
      .mockResolvedValueOnce([
        { id: 's1', draftId: 'd1' },
        { id: 's2', draftId: null },
      ])
      .mockResolvedValue([]);
    repository.findFilesOfSubmissions.mockResolvedValue([
      { id: 'f1', submissionId: 's1', storageKey: 'files/a' },
      { id: 'f2', submissionId: 's2', storageKey: 'files/b' },
    ]);

    const counts = await service.runCleanup(NOW);

    expect(storage.delete).toHaveBeenCalledWith('files/a');
    expect(storage.delete).toHaveBeenCalledWith('files/b');
    expect(repository.deleteSubmissions).toHaveBeenCalledWith(
      ['s1', 's2'],
      ['d1'],
    );
    expect(counts).toEqual({ drafts: 0, submissions: 2, files: 2 });
  });

  it('keeps an object some other file still uses', async () => {
    repository.findSubmissionsReceivedBefore.mockResolvedValueOnce([
      { id: 's1', draftId: null },
    ]);
    repository.findFilesOfSubmissions.mockResolvedValue([
      { id: 'f1', submissionId: 's1', storageKey: 'files/a' },
    ]);
    repository.findReferencedStorageKeys.mockResolvedValue(
      new Set(['files/a']),
    );

    const counts = await service.runCleanup(NOW);

    expect(repository.findReferencedStorageKeys).toHaveBeenCalledWith(
      ['files/a'],
      ['f1'],
    );
    expect(storage.delete).not.toHaveBeenCalled();
    expect(counts).toMatchObject({ submissions: 1, files: 0 });
  });

  it('keeps a submission whose object cannot be deleted, and stops the run', async () => {
    repository.findSubmissionsReceivedBefore.mockResolvedValue([
      { id: 's1', draftId: 'd1' },
      { id: 's2', draftId: null },
    ]);
    repository.findFilesOfSubmissions.mockResolvedValue([
      { id: 'f1', submissionId: 's1', storageKey: 'files/a' },
    ]);
    storage.delete.mockRejectedValue(new Error('s3 down'));

    const counts = await service.runCleanup(NOW);

    expect(repository.deleteSubmissions).toHaveBeenCalledWith(['s2'], []);
    expect(repository.findSubmissionsReceivedBefore).toHaveBeenCalledTimes(1);
    expect(counts.submissions).toBe(1);
  });

  it('works through a backlog a batch at a time', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      id: `s${i}`,
      draftId: null,
    }));
    repository.findSubmissionsReceivedBefore
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([{ id: 'last', draftId: null }]);

    const counts = await service.runCleanup(NOW);

    expect(repository.deleteSubmissions).toHaveBeenCalledTimes(2);
    expect(counts.submissions).toBe(501);
  });

  describe('schedule', () => {
    afterEach(() => {
      service.stopCleanupSchedule();
      jest.useRealTimers();
    });

    it('runs hourly, once however often it is started, until stopped', async () => {
      jest.useFakeTimers();
      service.startCleanupSchedule();
      service.startCleanupSchedule();

      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(1);

      service.stopCleanupSchedule();
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(1);
    });

    it('survives a failed run', async () => {
      jest.useFakeTimers();
      repository.deleteExpiredDrafts.mockRejectedValue(new Error('db down'));
      service.startCleanupSchedule();
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      repository.deleteExpiredDrafts.mockResolvedValue(0);
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(2);
    });
  });
});
