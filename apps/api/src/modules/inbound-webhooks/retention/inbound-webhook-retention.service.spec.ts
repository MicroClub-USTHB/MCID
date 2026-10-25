import { Logger } from '@nestjs/common';
import { InboundWebhookRetentionService } from './inbound-webhook-retention.service';

const NOW = new Date('2026-06-01T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('InboundWebhookRetentionService', () => {
  let repository: Record<string, jest.Mock>;
  let files: Record<string, jest.Mock>;
  let service: InboundWebhookRetentionService;
  let log: jest.SpyInstance;

  const build = (retentionDays?: unknown) => {
    service = new InboundWebhookRetentionService(
      repository as never,
      files as never,
      {
        get: (name: string, fallback: unknown) =>
          name === 'INBOUND_WEBHOOK_SUBMISSION_RETENTION_DAYS' &&
          retentionDays !== undefined
            ? retentionDays
            : fallback,
      } as never,
    );
  };
  const cutoffOf = (call: number) =>
    repository.findSubmissionsReceivedBefore.mock.calls[call][0] as Date;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    repository = {
      deleteExpiredDrafts: jest.fn().mockResolvedValue(0),
      findSubmissionsReceivedBefore: jest.fn().mockResolvedValue([]),
      findFilesOfSubmissions: jest.fn().mockResolvedValue([]),
      deleteSubmissions: jest.fn((ids: string[]) =>
        Promise.resolve(ids.length),
      ),
    };
    files = {
      removeUnreferencedObjects: jest
        .fn()
        .mockResolvedValue({ removed: 0, failed: new Set() }),
    };
    build();
  });

  afterEach(() => jest.restoreAllMocks());

  it('sweeps drafts a day after they expired and logs every count', async () => {
    repository.deleteExpiredDrafts.mockResolvedValue(4);

    const counts = await service.runCleanup(NOW);

    expect(repository.deleteExpiredDrafts).toHaveBeenCalledWith(
      new Date(NOW.getTime() - DAY),
    );
    expect(counts).toEqual({ drafts: 4, submissions: 0, objects: 0 });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('4 expired drafts'),
    );
  });

  it('cuts off at 365 days by default and at the configured number otherwise', async () => {
    await service.runCleanup(NOW);
    expect(cutoffOf(0)).toEqual(new Date(NOW.getTime() - 365 * DAY));

    build('30');
    await service.runCleanup(NOW);
    expect(cutoffOf(1)).toEqual(new Date(NOW.getTime() - 30 * DAY));
  });

  it.each(['', 'soon', '0', '-5', '1000000000'])(
    'falls back to 365 days for %p rather than deleting everything or overflowing',
    async (value) => {
      build(value);
      await service.runCleanup(NOW);
      expect(cutoffOf(0)).toEqual(new Date(NOW.getTime() - 365 * DAY));
    },
  );

  it('deletes a submission with its objects and its draft', async () => {
    repository.findSubmissionsReceivedBefore
      .mockResolvedValueOnce([
        { id: 's1', draftId: 'd1' },
        { id: 's2', draftId: null },
      ])
      .mockResolvedValue([]);
    const batchFiles = [
      { id: 'f1', submissionId: 's1', storageKey: 'files/a' },
      { id: 'f2', submissionId: 's2', storageKey: 'files/b' },
    ];
    repository.findFilesOfSubmissions.mockResolvedValue(batchFiles);
    files.removeUnreferencedObjects.mockResolvedValue({
      removed: 2,
      failed: new Set(),
    });

    const counts = await service.runCleanup(NOW);

    expect(files.removeUnreferencedObjects).toHaveBeenCalledWith(batchFiles);
    expect(repository.deleteSubmissions).toHaveBeenCalledWith(
      ['s1', 's2'],
      ['d1'],
    );
    expect(counts).toEqual({ drafts: 0, submissions: 2, objects: 2 });
  });

  it('keeps a submission whose object cannot be deleted, and moves on past it', async () => {
    const stuck = { id: 's1', draftId: 'd1' };
    const free = { id: 's2', draftId: null };
    repository.findSubmissionsReceivedBefore
      .mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, i) =>
          i === 0 ? stuck : i === 1 ? free : { id: `x${i}`, draftId: null },
        ),
      )
      .mockResolvedValueOnce([{ id: 'newer', draftId: null }]);
    repository.findFilesOfSubmissions.mockResolvedValueOnce([
      { id: 'f1', submissionId: 's1', storageKey: 'files/a' },
    ]);
    files.removeUnreferencedObjects.mockResolvedValueOnce({
      removed: 0,
      failed: new Set(['files/a']),
    });

    const counts = await service.runCleanup(NOW);

    const firstDeleted = repository.deleteSubmissions.mock.calls[0][0];
    expect(firstDeleted).not.toContain('s1');
    expect(firstDeleted).toContain('s2');
    // The next batch is asked to skip the stuck one, so newer data is reached
    expect(repository.findSubmissionsReceivedBefore.mock.calls[1][2]).toEqual([
      's1',
    ]);
    expect(repository.deleteSubmissions.mock.calls[1][0]).toEqual(['newer']);
    expect(counts.submissions).toBe(499 + 1);
  });

  it('gives up once a batch worth of submissions is stuck', async () => {
    const batch = Array.from({ length: 500 }, (_, i) => ({
      id: `s${i}`,
      draftId: null,
    }));
    repository.findSubmissionsReceivedBefore.mockResolvedValue(batch);
    repository.findFilesOfSubmissions.mockResolvedValue(
      batch.map((s) => ({
        id: `f-${s.id}`,
        submissionId: s.id,
        storageKey: `files/${s.id}`,
      })),
    );
    files.removeUnreferencedObjects.mockResolvedValue({
      removed: 0,
      failed: new Set(batch.map((s) => `files/${s.id}`)),
    });

    const counts = await service.runCleanup(NOW);

    expect(repository.findSubmissionsReceivedBefore).toHaveBeenCalledTimes(1);
    expect(counts.submissions).toBe(0);
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

  it('still purges submissions when the draft sweep fails, then reports the failure', async () => {
    repository.deleteExpiredDrafts.mockRejectedValue(new Error('db blip'));
    repository.findSubmissionsReceivedBefore.mockResolvedValueOnce([
      { id: 's1', draftId: null },
    ]);

    await expect(service.runCleanup(NOW)).rejects.toThrow('db blip');
    expect(repository.deleteSubmissions).toHaveBeenCalledWith(['s1'], []);
  });

  describe('schedule', () => {
    afterEach(() => {
      service.stopCleanupSchedule();
      jest.useRealTimers();
    });

    it('runs soon after boot, then hourly, once however often it is started', async () => {
      jest.useFakeTimers();
      service.startCleanupSchedule();
      service.startCleanupSchedule();

      await jest.advanceTimersByTimeAsync(60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(2);

      service.stopCleanupSchedule();
      await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(2);
    });

    it('survives a failed run', async () => {
      jest.useFakeTimers();
      repository.deleteExpiredDrafts.mockRejectedValueOnce(new Error('down'));
      service.startCleanupSchedule();
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(repository.deleteExpiredDrafts).toHaveBeenCalledTimes(2);
    });
  });
});
