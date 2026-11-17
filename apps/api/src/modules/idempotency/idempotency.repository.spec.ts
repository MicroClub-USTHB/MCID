import { IdempotencyRepository } from './idempotency.repository';

describe('IdempotencyRepository', () => {
  let repository: IdempotencyRepository;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    repository = new IdempotencyRepository(mockDb);
  });

  it('should find key by projectId and key', async () => {
    const mockRow = { id: 'id-1', projectId: 'p1', key: 'k1' };
    const queryBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([mockRow]),
    };
    mockDb.select.mockReturnValue(queryBuilder);

    const result = await repository.findByIdempotencyKey('p1', 'k1');
    expect(result).toEqual(mockRow);
  });

  it('should reserve a new key atomically', async () => {
    const mockInserted = { id: 'id-1', projectId: 'p1', key: 'k1', status: 'in_progress' };
    const insertBuilder = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([mockInserted]),
    };
    mockDb.insert.mockReturnValue(insertBuilder);

    const result = await repository.reserveKey({
      projectId: 'p1',
      key: 'k1',
      requestHash: 'hash-1',
      expiresAt: new Date(),
    });

    expect(result.reserved).toBe(true);
    expect(result.row).toEqual(mockInserted);
  });

  it('should return existing key if key already exists and is not expired', async () => {
    const existingRow = {
      id: 'id-1',
      projectId: 'p1',
      key: 'k1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 100000),
    };

    // First insert conflicts (returns empty array)
    const insertBuilder = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };
    mockDb.insert.mockReturnValue(insertBuilder);

    // select returns existing
    const selectBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([existingRow]),
    };
    mockDb.select.mockReturnValue(selectBuilder);

    const result = await repository.reserveKey({
      projectId: 'p1',
      key: 'k1',
      requestHash: 'hash-1',
      expiresAt: new Date(),
    });

    expect(result.reserved).toBe(false);
    expect(result.row).toEqual(existingRow);
  });

  it('should complete key with response status and body', async () => {
    const updateBuilder = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.update.mockReturnValue(updateBuilder);

    await repository.completeKey({
      id: 'id-1',
      responseStatus: 201,
      responseBody: { success: true },
    });

    expect(mockDb.update).toHaveBeenCalled();
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        responseStatus: 201,
        responseBody: { success: true },
      }),
    );
  });

  it('should release key on error', async () => {
    const deleteBuilder = {
      where: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.delete.mockReturnValue(deleteBuilder);

    await repository.releaseKey('id-1');
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it('should delete expired keys', async () => {
    const deleteBuilder = {
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]),
    };
    mockDb.delete.mockReturnValue(deleteBuilder);

    const purged = await repository.deleteExpiredKeys();
    expect(purged).toBe(2);
  });
});
