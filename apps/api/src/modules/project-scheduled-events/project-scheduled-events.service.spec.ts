import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Discord from 'discord.js';
import { AuditService } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { ProjectScheduledEventsRepository } from './project-scheduled-events.repository';
import { ProjectScheduledEventsService } from './project-scheduled-events.service';

describe('ProjectScheduledEventsService', () => {
  let service: ProjectScheduledEventsService;
  let repository: any;
  let discordService: any;
  let auditService: any;

  beforeEach(async () => {
    repository = {
      recordCreatedEvent: jest.fn(),
      findOwnedEvent: jest.fn(),
      deleteOwnedEvent: jest.fn(),
    };

    discordService = {
      getGuildById: jest.fn(),
      getChannelById: jest.fn(),
      getScheduledEvent: jest.fn(),
      createScheduledEvent: jest.fn(),
      editScheduledEvent: jest.fn(),
      deleteScheduledEvent: jest.fn(),
    };

    auditService = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectScheduledEventsService,
        { provide: ProjectScheduledEventsRepository, useValue: repository },
        { provide: DiscordService, useValue: discordService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ProjectScheduledEventsService>(
      ProjectScheduledEventsService,
    );
  });

  describe('createEvent', () => {
    const validDto = {
      name: 'Hackathon 2026',
      description: 'Annual hackathon',
      startsAt: '2026-12-05T09:00:00.000Z',
      endsAt: '2026-12-06T18:00:00.000Z',
      location: 'USTHB',
    };

    it('rejects when neither location nor channelId is provided', async () => {
      await expect(
        service.createEvent('proj-1', 'srv-1', {
          name: 'Event',
          startsAt: '2026-12-05T09:00:00.000Z',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when both location and channelId are provided', async () => {
      await expect(
        service.createEvent('proj-1', 'srv-1', {
          ...validDto,
          channelId: '910000000000000010',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects external event without endsAt', async () => {
      await expect(
        service.createEvent('proj-1', 'srv-1', {
          name: 'Event',
          startsAt: '2026-12-05T09:00:00.000Z',
          location: 'USTHB',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid time range (endsAt <= startsAt)', async () => {
      await expect(
        service.createEvent('proj-1', 'srv-1', {
          name: 'Event',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-05T08:00:00.000Z',
          location: 'USTHB',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if server does not exist', async () => {
      discordService.getGuildById.mockResolvedValue(null);
      await expect(
        service.createEvent('proj-1', 'srv-1', validDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if channelId does not exist', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      discordService.getChannelById.mockResolvedValue(null);

      await expect(
        service.createEvent('proj-1', 'srv-1', {
          name: 'Voice Event',
          startsAt: '2026-12-05T09:00:00.000Z',
          channelId: '910000000000000010',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    const channel = (guildId: string, type: Discord.ChannelType) => ({
      guildId,
      type,
      isDMBased: () => false,
    });
    const voiceDto = {
      name: 'Voice Event',
      startsAt: '2026-12-05T09:00:00.000Z',
      channelId: '910000000000000010',
    };

    it('answers 404 for a channel of another server', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      discordService.getChannelById.mockResolvedValue(
        channel('srv-2', Discord.ChannelType.GuildVoice),
      );

      await expect(
        service.createEvent('proj-1', 'srv-1', voiceDto),
      ).rejects.toThrow(NotFoundException);
      expect(discordService.createScheduledEvent).not.toHaveBeenCalled();
    });

    it('rejects a channel that is not a voice or stage channel', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      discordService.getChannelById.mockResolvedValue(
        channel('srv-1', Discord.ChannelType.GuildText),
      );

      await expect(
        service.createEvent('proj-1', 'srv-1', voiceDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a stage event for a stage channel', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      discordService.getChannelById.mockResolvedValue(
        channel('srv-1', Discord.ChannelType.GuildStageVoice),
      );
      discordService.createScheduledEvent.mockResolvedValue({
        id: 'evt-1',
        name: voiceDto.name,
        scheduledStartAt: new Date(voiceDto.startsAt),
        channelId: voiceDto.channelId,
        status: 1,
        entityType: 1,
      });
      repository.recordCreatedEvent.mockResolvedValue({
        createdAt: new Date(),
      });

      const result = await service.createEvent('proj-1', 'srv-1', voiceDto);

      expect(discordService.createScheduledEvent).toHaveBeenCalledWith(
        'srv-1',
        expect.objectContaining({
          channelId: voiceDto.channelId,
          entityType: Discord.GuildScheduledEventEntityType.StageInstance,
        }),
      );
      expect(result.entityType).toBe('STAGE_INSTANCE');
    });

    it('creates external event, records ownership and logs audit', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      const mockEvent = {
        id: 'evt-1',
        name: validDto.name,
        description: validDto.description,
        scheduledStartAt: new Date(validDto.startsAt),
        scheduledEndAt: new Date(validDto.endsAt),
        entityMetadata: { location: validDto.location },
        channelId: null,
        status: 1, // SCHEDULED
        entityType: 3, // EXTERNAL
        delete: jest.fn(),
      };
      discordService.createScheduledEvent.mockResolvedValue(mockEvent);

      const dbRow = {
        id: 'row-1',
        projectId: 'proj-1',
        serverId: 'srv-1',
        eventId: 'evt-1',
        createdAt: new Date('2026-11-17T18:00:00.000Z'),
      };
      repository.recordCreatedEvent.mockResolvedValue(dbRow);

      const result = await service.createEvent('proj-1', 'srv-1', validDto);

      expect(result).toEqual({
        id: 'evt-1',
        serverId: 'srv-1',
        name: validDto.name,
        description: validDto.description,
        startsAt: validDto.startsAt,
        endsAt: validDto.endsAt,
        location: validDto.location,
        channelId: null,
        status: 'SCHEDULED',
        entityType: 'EXTERNAL',
        createdAt: dbRow.createdAt.toISOString(),
      });

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'server',
          action: 'scheduled_event_created',
          entityType: 'scheduled_event',
          entityId: 'evt-1',
        }),
      );
    });

    it('compensates and deletes Discord event if DB recording fails', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      const mockEvent = {
        id: 'evt-1',
        name: validDto.name,
        delete: jest.fn().mockResolvedValue(undefined),
      };
      discordService.createScheduledEvent.mockResolvedValue(mockEvent);
      repository.recordCreatedEvent.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.createEvent('proj-1', 'srv-1', validDto),
      ).rejects.toThrow('Database error');

      expect(mockEvent.delete).toHaveBeenCalled();
    });

    it('maps Discord MissingPermissions (50013) to BadGatewayException', async () => {
      discordService.getGuildById.mockResolvedValue({ id: 'srv-1' });
      discordService.createScheduledEvent.mockRejectedValue(
        new Discord.DiscordAPIError(
          { code: 50013, message: 'Missing Permissions' },
          50013,
          403,
          'POST',
          'https://discord.com/api/v10/guilds/srv-1/scheduled-events',
          { files: undefined, body: undefined },
        ),
      );

      await expect(
        service.createEvent('proj-1', 'srv-1', validDto),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('updateEvent', () => {
    it('throws NotFoundException if event is not owned by project', async () => {
      repository.findOwnedEvent.mockResolvedValue(null);

      await expect(
        service.updateEvent('proj-1', 'srv-1', 'evt-1', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if event is not found on Discord', async () => {
      repository.findOwnedEvent.mockResolvedValue({
        id: 'row-1',
        createdAt: new Date(),
      });
      discordService.getScheduledEvent.mockResolvedValue(null);

      await expect(
        service.updateEvent('proj-1', 'srv-1', 'evt-1', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if update causes invalid time range', async () => {
      repository.findOwnedEvent.mockResolvedValue({
        id: 'row-1',
        createdAt: new Date(),
      });
      discordService.getScheduledEvent.mockResolvedValue({
        id: 'evt-1',
        scheduledStartAt: new Date('2026-12-05T09:00:00.000Z'),
        scheduledEndAt: new Date('2026-12-06T18:00:00.000Z'),
      });

      await expect(
        service.updateEvent('proj-1', 'srv-1', 'evt-1', {
          endsAt: '2026-12-05T08:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an update with both location and channelId', async () => {
      repository.findOwnedEvent.mockResolvedValue({ createdAt: new Date() });
      discordService.getScheduledEvent.mockResolvedValue({ id: 'evt-1' });

      await expect(
        service.updateEvent('proj-1', 'srv-1', 'evt-1', {
          location: 'USTHB',
          channelId: '910000000000000010',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(discordService.editScheduledEvent).not.toHaveBeenCalled();
    });

    it('requires endsAt to move a voice event without an end to a location', async () => {
      repository.findOwnedEvent.mockResolvedValue({ createdAt: new Date() });
      discordService.getScheduledEvent.mockResolvedValue({
        id: 'evt-1',
        scheduledStartAt: new Date('2026-12-05T09:00:00.000Z'),
        scheduledEndAt: null,
      });

      await expect(
        service.updateEvent('proj-1', 'srv-1', 'evt-1', { location: 'USTHB' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('answers 404 when moving the event to a channel of another server', async () => {
      repository.findOwnedEvent.mockResolvedValue({ createdAt: new Date() });
      discordService.getScheduledEvent.mockResolvedValue({ id: 'evt-1' });
      discordService.getChannelById.mockResolvedValue({
        guildId: 'srv-2',
        type: Discord.ChannelType.GuildVoice,
        isDMBased: () => false,
      });

      await expect(
        service.updateEvent('proj-1', 'srv-1', 'evt-1', {
          channelId: '910000000000000010',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(discordService.editScheduledEvent).not.toHaveBeenCalled();
    });

    it('updates event successfully and logs audit', async () => {
      const createdAt = new Date('2026-11-17T18:00:00.000Z');
      repository.findOwnedEvent.mockResolvedValue({
        id: 'row-1',
        createdAt,
      });
      discordService.getScheduledEvent.mockResolvedValue({
        id: 'evt-1',
        scheduledStartAt: new Date('2026-12-05T09:00:00.000Z'),
        scheduledEndAt: new Date('2026-12-06T18:00:00.000Z'),
      });

      const updatedDiscordEvent = {
        id: 'evt-1',
        name: 'Updated Name',
        description: 'New Desc',
        scheduledStartAt: new Date('2026-12-05T10:00:00.000Z'),
        scheduledEndAt: new Date('2026-12-06T18:00:00.000Z'),
        entityMetadata: { location: 'USTHB Cyber' },
        channelId: null,
        status: 1,
        entityType: 3,
      };
      discordService.editScheduledEvent.mockResolvedValue(updatedDiscordEvent);

      const result = await service.updateEvent('proj-1', 'srv-1', 'evt-1', {
        name: 'Updated Name',
        description: 'New Desc',
        startsAt: '2026-12-05T10:00:00.000Z',
        location: 'USTHB Cyber',
      });

      expect(result.name).toBe('Updated Name');
      expect(result.location).toBe('USTHB Cyber');
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'server',
          action: 'scheduled_event_updated',
          entityType: 'scheduled_event',
          entityId: 'evt-1',
        }),
      );
    });
  });

  describe('deleteEvent', () => {
    it('throws NotFoundException if event is not owned by project', async () => {
      repository.findOwnedEvent.mockResolvedValue(null);

      await expect(
        service.deleteEvent('proj-1', 'srv-1', 'evt-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes from Discord, removes DB record, and logs audit', async () => {
      repository.findOwnedEvent.mockResolvedValue({
        id: 'row-1',
      });
      discordService.deleteScheduledEvent.mockResolvedValue(true);
      repository.deleteOwnedEvent.mockResolvedValue(true);

      await service.deleteEvent('proj-1', 'srv-1', 'evt-1');

      expect(discordService.deleteScheduledEvent).toHaveBeenCalledWith(
        'srv-1',
        'evt-1',
      );
      expect(repository.deleteOwnedEvent).toHaveBeenCalledWith(
        'proj-1',
        'srv-1',
        'evt-1',
      );
      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'server',
          action: 'scheduled_event_deleted',
          entityType: 'scheduled_event',
          entityId: 'evt-1',
        }),
      );
    });
  });
});
