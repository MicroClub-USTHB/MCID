import { Test, TestingModule } from '@nestjs/testing';
import { ProjectScheduledEventsController } from './project-scheduled-events.controller';
import { ProjectScheduledEventsService } from './project-scheduled-events.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ProjectThrottlerGuard } from '../channels/guards/project-throttler.guard';

describe('ProjectScheduledEventsController', () => {
  let controller: ProjectScheduledEventsController;
  let service: {
    createEvent: jest.Mock;
    updateEvent: jest.Mock;
    deleteEvent: jest.Mock;
  };

  const PROJECT_ID = 'proj-123';
  const SERVER_ID = '987654321098765432';
  const EVENT_ID = '920000000000000001';

  beforeEach(async () => {
    service = {
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectScheduledEventsController],
      providers: [
        {
          provide: ProjectScheduledEventsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProjectThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectScheduledEventsController>(
      ProjectScheduledEventsController,
    );
  });

  it('createEvent delegates to service with project ID', async () => {
    const dto = {
      name: 'Hackathon 2026',
      startsAt: '2026-12-05T09:00:00Z',
      endsAt: '2026-12-06T18:00:00Z',
      location: 'USTHB',
    };
    const expected = {
      id: EVENT_ID,
      serverId: SERVER_ID,
      name: 'Hackathon 2026',
      description: null,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      location: dto.location,
      channelId: null,
      status: 'SCHEDULED',
      entityType: 'EXTERNAL',
      createdAt: '2026-11-17T18:00:00.000Z',
    };
    service.createEvent.mockResolvedValue(expected);

    const req = { project: { id: PROJECT_ID } } as any;
    const result = await controller.createEvent(SERVER_ID, dto, req);

    expect(service.createEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      SERVER_ID,
      dto,
    );
    expect(result).toEqual(expected);
  });

  it('updateEvent delegates to service with project ID', async () => {
    const dto = { name: 'Updated Event Name' };
    const expected = {
      id: EVENT_ID,
      serverId: SERVER_ID,
      name: 'Updated Event Name',
      description: null,
      startsAt: '2026-12-05T09:00:00Z',
      endsAt: '2026-12-06T18:00:00Z',
      location: 'USTHB',
      channelId: null,
      status: 'SCHEDULED',
      entityType: 'EXTERNAL',
      createdAt: '2026-11-17T18:00:00.000Z',
    };
    service.updateEvent.mockResolvedValue(expected);

    const req = { project: { id: PROJECT_ID } } as any;
    const result = await controller.updateEvent(SERVER_ID, EVENT_ID, dto, req);

    expect(service.updateEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      SERVER_ID,
      EVENT_ID,
      dto,
    );
    expect(result).toEqual(expected);
  });

  it('deleteEvent delegates to service with project ID', async () => {
    service.deleteEvent.mockResolvedValue(undefined);

    const req = { project: { id: PROJECT_ID } } as any;
    await controller.deleteEvent(SERVER_ID, EVENT_ID, req);

    expect(service.deleteEvent).toHaveBeenCalledWith(
      PROJECT_ID,
      SERVER_ID,
      EVENT_ID,
    );
  });
});
