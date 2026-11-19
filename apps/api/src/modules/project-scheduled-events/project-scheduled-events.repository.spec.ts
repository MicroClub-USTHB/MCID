import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { ProjectScheduledEventsRepository } from './project-scheduled-events.repository';

describe('ProjectScheduledEventsRepository', () => {
  let repository: ProjectScheduledEventsRepository;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectScheduledEventsRepository,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    repository = module.get<ProjectScheduledEventsRepository>(
      ProjectScheduledEventsRepository,
    );
  });

  it('recordCreatedEvent inserts into projectScheduledEvents and returns row', async () => {
    const expected = {
      id: 'uuid-1',
      projectId: 'proj-1',
      serverId: 'server-1',
      eventId: 'evt-1',
      createdAt: new Date(),
    };

    const returningMock = jest.fn().mockResolvedValue([expected]);
    const onConflictDoNothingMock = jest.fn().mockReturnValue({
      returning: returningMock,
    });
    const valuesMock = jest.fn().mockReturnValue({
      onConflictDoNothing: onConflictDoNothingMock,
    });
    mockDb.insert.mockReturnValue({ values: valuesMock });

    const result = await repository.recordCreatedEvent({
      projectId: 'proj-1',
      serverId: 'server-1',
      eventId: 'evt-1',
    });

    expect(mockDb.insert).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        serverId: 'server-1',
        eventId: 'evt-1',
      }),
    );
    expect(result).toEqual(expected);
  });

  it('findOwnedEvent returns row if found', async () => {
    const expected = {
      id: 'uuid-1',
      projectId: 'proj-1',
      serverId: 'server-1',
      eventId: 'evt-1',
      createdAt: new Date(),
    };

    const limitMock = jest.fn().mockResolvedValue([expected]);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    mockDb.select.mockReturnValue({ from: fromMock });

    const result = await repository.findOwnedEvent(
      'proj-1',
      'server-1',
      'evt-1',
    );
    expect(result).toEqual(expected);
  });

  it('findOwnedEvent returns null if not found', async () => {
    const limitMock = jest.fn().mockResolvedValue([]);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    mockDb.select.mockReturnValue({ from: fromMock });

    const result = await repository.findOwnedEvent(
      'proj-1',
      'server-1',
      'evt-1',
    );
    expect(result).toBeNull();
  });

  it('deleteOwnedEvent deletes row and returns true if deleted', async () => {
    const returningMock = jest.fn().mockResolvedValue([{ id: 'uuid-1' }]);
    const whereMock = jest.fn().mockReturnValue({ returning: returningMock });
    mockDb.delete.mockReturnValue({ where: whereMock });

    const result = await repository.deleteOwnedEvent(
      'proj-1',
      'server-1',
      'evt-1',
    );
    expect(result).toBe(true);
  });

  it('deleteOwnedEvent returns false if nothing deleted', async () => {
    const returningMock = jest.fn().mockResolvedValue([]);
    const whereMock = jest.fn().mockReturnValue({ returning: returningMock });
    mockDb.delete.mockReturnValue({ where: whereMock });

    const result = await repository.deleteOwnedEvent(
      'proj-1',
      'server-1',
      'evt-1',
    );
    expect(result).toBe(false);
  });
});
