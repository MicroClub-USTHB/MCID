import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { ProjectRolesRepository } from './project-roles.repository';

describe('ProjectRolesRepository', () => {
  let repository: ProjectRolesRepository;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectRolesRepository,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    repository = module.get<ProjectRolesRepository>(ProjectRolesRepository);
  });

  it('recordCreatedRole inserts into projectCreatedRoles and returns row', async () => {
    const expected = {
      id: 'uuid-1',
      projectId: 'proj-1',
      roleId: 'role-1',
      serverId: 'server-1',
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

    const result = await repository.recordCreatedRole({
      projectId: 'proj-1',
      roleId: 'role-1',
      serverId: 'server-1',
    });

    expect(mockDb.insert).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        roleId: 'role-1',
        serverId: 'server-1',
      }),
    );
    expect(result).toEqual(expected);
  });

  it('isRoleCreatedByProject returns true if row exists', async () => {
    const limitMock = jest.fn().mockResolvedValue([{ id: 'uuid-1' }]);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    mockDb.select.mockReturnValue({ from: fromMock });

    const result = await repository.isRoleCreatedByProject('proj-1', 'role-1');
    expect(result).toBe(true);
  });

  it('isRoleCreatedByProject returns false if no row exists', async () => {
    const limitMock = jest.fn().mockResolvedValue([]);
    const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereMock });
    mockDb.select.mockReturnValue({ from: fromMock });

    const result = await repository.isRoleCreatedByProject('proj-1', 'role-1');
    expect(result).toBe(false);
  });

  it('assignRoleToMember inserts into serverMemberRoles on conflict do nothing', async () => {
    const onConflictDoNothingMock = jest.fn().mockResolvedValue([]);
    const valuesMock = jest.fn().mockReturnValue({
      onConflictDoNothing: onConflictDoNothingMock,
    });
    mockDb.insert.mockReturnValue({ values: valuesMock });

    await repository.assignRoleToMember('discord-1', 'role-1');

    expect(mockDb.insert).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith({
      memberId: 'discord-1',
      roleId: 'role-1',
    });
  });

  it('removeRoleFromMember deletes from serverMemberRoles', async () => {
    const whereMock = jest.fn().mockResolvedValue([]);
    mockDb.delete.mockReturnValue({ where: whereMock });

    await repository.removeRoleFromMember('discord-1', 'role-1');

    expect(mockDb.delete).toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalled();
  });
});
