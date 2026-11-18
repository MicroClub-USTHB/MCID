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
    const mockInserted = {
      id: 'id-1',
      projectId: 'p1',
      key: 'k1',
      status: 'in_progress',
    };
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
      staleBefore: new Date(),
    });

    expect(result.reserved).toBe(true);
    expect(result.row).toEqual(mockInserted);
  });

  const conflictingInsert = () => ({
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
  });
  const updateReturning = (rows: unknown[]) => ({
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
  });
  const reserveParams = {
    projectId: 'p1',
    key: 'k1',
    requestHash: 'hash-1',
    expiresAt: new Date(Date.now() + 86_400_000),
    staleBefore: new Date(Date.now() - 300_000),
  };

  it('returns the existing key when it can be neither inserted nor taken over', async () => {
    const existingRow = {
      id: 'id-1',
      projectId: 'p1',
      key: 'k1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 100000),
    };
    mockDb.insert.mockReturnValue(conflictingInsert());
    mockDb.update.mockReturnValue(updateReturning([]));
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([existingRow]),
    });

    const result = await repository.reserveKey(reserveParams);

    expect(result).toEqual({ reserved: false, row: existingRow });
  });

  it('takes over an expired or stale in_progress key with one conditional update', async () => {
    const reclaimed = {
      id: 'id-1',
      status: 'in_progress',
      requestHash: 'hash-1',
    };
    const update = updateReturning([reclaimed]);
    mockDb.insert.mockReturnValue(conflictingInsert());
    mockDb.update.mockReturnValue(update);

    const result = await repository.reserveKey(reserveParams);

    expect(result).toEqual({ reserved: true, row: reclaimed });
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_progress',
        requestHash: 'hash-1',
        responseBody: null,
      }),
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('answers 409 when the key vanished between the insert and the read', async () => {
    mockDb.insert.mockReturnValue(conflictingInsert());
    mockDb.update.mockReturnValue(updateReturning([]));
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });

    await expect(repository.reserveKey(reserveParams)).rejects.toThrow(
      'already in progress',
    );
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
