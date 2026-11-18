import { Test, TestingModule } from '@nestjs/testing';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectRolesService } from './project-roles.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

describe('ProjectRolesController', () => {
  let controller: ProjectRolesController;
  let service: {
    createRole: jest.Mock;
    grantRoleToMember: jest.Mock;
    removeRoleFromMember: jest.Mock;
  };

  const PROJECT_ID = 'proj-123';
  const SERVER_ID = '987654321098765432';
  const DISCORD_ID = '123456789012345678';
  const ROLE_ID = 'role-111';

  beforeEach(async () => {
    service = {
      createRole: jest.fn(),
      grantRoleToMember: jest.fn(),
      removeRoleFromMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectRolesController],
      providers: [
        {
          provide: ProjectRolesService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectRolesController>(ProjectRolesController);
  });

  it('createRole delegates to service with project ID', async () => {
    const dto = { name: 'Event Participant', color: 0xff0000 };
    const expected = {
      id: ROLE_ID,
      serverId: SERVER_ID,
      name: 'Event Participant',
      color: 0xff0000,
      mentionable: false,
      position: 1,
      createdAt: '2026-11-14T00:00:00.000Z',
    };
    service.createRole.mockResolvedValue(expected);

    const req = { project: { id: PROJECT_ID } } as any;
    const result = await controller.createRole(SERVER_ID, dto, req);

    expect(service.createRole).toHaveBeenCalledWith(PROJECT_ID, SERVER_ID, dto);
    expect(result).toEqual(expected);
  });

  it('grantRole delegates to service with project ID', async () => {
    service.grantRoleToMember.mockResolvedValue(undefined);

    const req = { project: { id: PROJECT_ID } } as any;
    await controller.grantRole(SERVER_ID, DISCORD_ID, ROLE_ID, req);

    expect(service.grantRoleToMember).toHaveBeenCalledWith(
      PROJECT_ID,
      SERVER_ID,
      DISCORD_ID,
      ROLE_ID,
    );
  });

  it('removeRole delegates to service with project ID', async () => {
    service.removeRoleFromMember.mockResolvedValue(undefined);

    const req = { project: { id: PROJECT_ID } } as any;
    await controller.removeRole(SERVER_ID, DISCORD_ID, ROLE_ID, req);

    expect(service.removeRoleFromMember).toHaveBeenCalledWith(
      PROJECT_ID,
      SERVER_ID,
      DISCORD_ID,
      ROLE_ID,
    );
  });
});
