import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { IdempotencyRepository } from './idempotency.repository';

describe('IdempotencyCleanupService', () => {
  let service: IdempotencyCleanupService;
  let repository: jest.Mocked<IdempotencyRepository>;

  beforeEach(() => {
    repository = {
      deleteExpiredKeys: jest.fn().mockResolvedValue(5),
    } as unknown as jest.Mocked<IdempotencyRepository>;

    service = new IdempotencyCleanupService(repository);
  });

  afterEach(() => {
    service.stopCleanupSchedule();
  });

  it('should run cleanup and return number of deleted keys', async () => {
    const deleted = await service.runCleanup();
    expect(deleted).toBe(5);
    expect(repository.deleteExpiredKeys).toHaveBeenCalled();
  });

  it('should handle repository errors gracefully without throwing', async () => {
    repository.deleteExpiredKeys.mockRejectedValue(new Error('DB failure'));

    const deleted = await service.runCleanup();
    expect(deleted).toBe(0);
  });

  it('should initialize and stop cleanup timer schedule cleanly', () => {
    service.startCleanupSchedule();
    expect((service as any).timer).not.toBeNull();

    service.stopCleanupSchedule();
    expect((service as any).timer).toBeNull();
  });
});
