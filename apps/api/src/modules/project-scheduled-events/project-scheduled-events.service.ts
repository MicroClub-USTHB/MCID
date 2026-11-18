import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import Discord from 'discord.js';
import { AuditService } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import {
  ProjectScheduledEventsRepository,
  ProjectScheduledEventRow,
} from './project-scheduled-events.repository';
import { CreateScheduledEventDto } from './dto/create-scheduled-event.dto';
import { UpdateScheduledEventDto } from './dto/update-scheduled-event.dto';
import { ScheduledEventResponseDto } from './dto/scheduled-event-response.dto';

@Injectable()
export class ProjectScheduledEventsService {
  private readonly logger = new Logger(ProjectScheduledEventsService.name);

  constructor(
    private readonly repository: ProjectScheduledEventsRepository,
    private readonly discordService: DiscordService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates a scheduled event in the server on Discord, records ownership,
   * and creates an audit entry.
   */
  async createEvent(
    projectId: string,
    serverId: string,
    dto: CreateScheduledEventDto,
  ): Promise<ScheduledEventResponseDto> {
    this.validateCreatePayload(dto);

    const guild = await this.discordService.getGuildById(serverId);
    if (!guild) {
      throw new NotFoundException(`Server ${serverId} not found`);
    }

    const channelEntityType = dto.channelId
      ? await this.resolveChannelEntityType(serverId, dto.channelId)
      : undefined;

    let createdDiscordEvent: Discord.GuildScheduledEvent;
    try {
      const event = await this.discordService.createScheduledEvent(serverId, {
        name: dto.name,
        description: dto.description,
        scheduledStartTime: dto.startsAt,
        scheduledEndTime: dto.endsAt,
        location: dto.location,
        channelId: dto.channelId,
        entityType: channelEntityType,
        reason: `Created by project ${projectId}`,
      });
      if (!event) {
        throw new ServiceUnavailableException(
          'Discord is unavailable or failed to create event',
        );
      }
      createdDiscordEvent = event;
    } catch (error: unknown) {
      this.handleDiscordError(error);
    }

    let savedRow: ProjectScheduledEventRow;
    try {
      savedRow = await this.repository.recordCreatedEvent({
        projectId,
        serverId,
        eventId: createdDiscordEvent.id,
      });
    } catch (dbError) {
      // Compensate: delete from Discord so we don't leave orphaned Discord events
      await createdDiscordEvent
        .delete()
        .catch((delErr: unknown) =>
          this.logger.error(
            `Failed to cleanup Discord event ${createdDiscordEvent.id} after DB failure: ${String(delErr)}`,
          ),
        );
      throw dbError;
    }

    this.auditService.logAction({
      actionType: 'server',
      action: 'scheduled_event_created',
      entityType: 'scheduled_event',
      entityId: createdDiscordEvent.id,
      details: {
        projectId,
        serverId,
        name: createdDiscordEvent.name,
        entityType: createdDiscordEvent.entityType,
      },
      severity: 'info',
    });

    return this.mapToDto(createdDiscordEvent, serverId, savedRow.createdAt);
  }

  /**
   * Updates an existing scheduled event, strictly checking project ownership.
   */
  async updateEvent(
    projectId: string,
    serverId: string,
    eventId: string,
    dto: UpdateScheduledEventDto,
  ): Promise<ScheduledEventResponseDto> {
    const owned = await this.repository.findOwnedEvent(
      projectId,
      serverId,
      eventId,
    );
    if (!owned) {
      throw new NotFoundException('Scheduled event not found');
    }

    const existingEvent = await this.discordService.getScheduledEvent(
      serverId,
      eventId,
    );
    if (!existingEvent) {
      throw new NotFoundException('Scheduled event not found');
    }

    if (dto.location && dto.channelId) {
      throw new BadRequestException(
        'Only one of location or channelId can be provided',
      );
    }
    this.validateUpdateDates(dto, existingEvent);
    if (dto.location && !dto.endsAt && !existingEvent.scheduledEndAt) {
      throw new BadRequestException(
        'endsAt is required for scheduled events with an external location',
      );
    }
    const channelEntityType = dto.channelId
      ? await this.resolveChannelEntityType(serverId, dto.channelId)
      : undefined;

    let updatedDiscordEvent: Discord.GuildScheduledEvent;
    try {
      const event = await this.discordService.editScheduledEvent(
        serverId,
        eventId,
        {
          name: dto.name,
          description: dto.description,
          scheduledStartTime: dto.startsAt,
          scheduledEndTime: dto.endsAt,
          location: dto.location,
          channelId: dto.channelId,
          entityType: channelEntityType,
          reason: `Updated by project ${projectId}`,
        },
      );
      if (!event) {
        throw new NotFoundException('Scheduled event not found');
      }
      updatedDiscordEvent = event;
    } catch (error: unknown) {
      this.handleDiscordError(error);
    }

    this.auditService.logAction({
      actionType: 'server',
      action: 'scheduled_event_updated',
      entityType: 'scheduled_event',
      entityId: eventId,
      details: {
        projectId,
        serverId,
        name: updatedDiscordEvent.name,
      },
      severity: 'info',
    });

    return this.mapToDto(updatedDiscordEvent, serverId, owned.createdAt);
  }

  /**
   * Deletes an existing scheduled event, strictly checking project ownership.
   */
  async deleteEvent(
    projectId: string,
    serverId: string,
    eventId: string,
  ): Promise<void> {
    const owned = await this.repository.findOwnedEvent(
      projectId,
      serverId,
      eventId,
    );
    if (!owned) {
      throw new NotFoundException('Scheduled event not found');
    }

    try {
      await this.discordService.deleteScheduledEvent(serverId, eventId);
    } catch (error: unknown) {
      this.handleDiscordError(error);
    }

    await this.repository.deleteOwnedEvent(projectId, serverId, eventId);

    this.auditService.logAction({
      actionType: 'server',
      action: 'scheduled_event_deleted',
      entityType: 'scheduled_event',
      entityId: eventId,
      details: {
        projectId,
        serverId,
      },
      severity: 'info',
    });
  }

  /**
   * A channel event needs a voice or stage channel of this server. A channel of
   * another server answers 404, like a missing one, so its existence is not revealed.
   */
  private async resolveChannelEntityType(
    serverId: string,
    channelId: string,
  ): Promise<Discord.GuildScheduledEventEntityType> {
    const channel = await this.discordService.getChannelById(channelId);
    if (!channel || channel.isDMBased() || channel.guildId !== serverId) {
      throw new NotFoundException('Channel not found');
    }
    if (channel.type === Discord.ChannelType.GuildStageVoice) {
      return Discord.GuildScheduledEventEntityType.StageInstance;
    }
    if (channel.type === Discord.ChannelType.GuildVoice) {
      return Discord.GuildScheduledEventEntityType.Voice;
    }
    throw new BadRequestException('channelId must be a voice or stage channel');
  }

  private validateCreatePayload(dto: CreateScheduledEventDto): void {
    if ((!dto.location && !dto.channelId) || (dto.location && dto.channelId)) {
      throw new BadRequestException(
        'Exactly one of location or channelId must be provided',
      );
    }

    if (dto.location && !dto.endsAt) {
      throw new BadRequestException(
        'endsAt is required for scheduled events with an external location',
      );
    }

    const startTime = new Date(dto.startsAt);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid startsAt timestamp');
    }

    if (dto.endsAt) {
      const endTime = new Date(dto.endsAt);
      if (
        isNaN(endTime.getTime()) ||
        endTime.getTime() <= startTime.getTime()
      ) {
        throw new BadRequestException('endsAt must be strictly after startsAt');
      }
    }
  }

  private validateUpdateDates(
    dto: UpdateScheduledEventDto,
    existing: Discord.GuildScheduledEvent,
  ): void {
    const startsAt = dto.startsAt
      ? new Date(dto.startsAt)
      : existing.scheduledStartAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.scheduledEndAt;

    if (dto.startsAt && isNaN(startsAt!.getTime())) {
      throw new BadRequestException('Invalid startsAt timestamp');
    }
    if (dto.endsAt && isNaN(endsAt!.getTime())) {
      throw new BadRequestException('Invalid endsAt timestamp');
    }

    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt must be strictly after startsAt');
    }
  }

  private handleDiscordError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof Discord.DiscordAPIError) {
      if (
        error.code === Discord.RESTJSONErrorCodes.MissingPermissions ||
        error.code === Discord.RESTJSONErrorCodes.MissingAccess ||
        error.status === 403
      ) {
        throw new BadGatewayException(
          'Discord bot lacks permissions to manage scheduled events',
        );
      }

      if (
        error.code === Discord.RESTJSONErrorCodes.UnknownGuildScheduledEvent ||
        error.status === 404
      ) {
        throw new NotFoundException('Scheduled event not found');
      }

      if (error.status === 400 || error.code === 50035) {
        throw new BadRequestException(
          error.message || 'Invalid scheduled event parameters or time range',
        );
      }

      throw new BadGatewayException(`Discord API error: ${error.message}`);
    }

    this.logger.error(
      `Unexpected error in scheduled event operation: ${String(error)}`,
    );
    throw new BadGatewayException('Failed to communicate with Discord');
  }

  private mapToDto(
    event: Discord.GuildScheduledEvent,
    serverId: string,
    createdAt: Date,
  ): ScheduledEventResponseDto {
    const statusMap: Record<number, string> = {
      1: 'SCHEDULED',
      2: 'ACTIVE',
      3: 'COMPLETED',
      4: 'CANCELED',
    };

    const typeMap: Record<number, string> = {
      1: 'STAGE_INSTANCE',
      2: 'VOICE',
      3: 'EXTERNAL',
    };

    return {
      id: event.id,
      serverId,
      name: event.name,
      description: event.description ?? null,
      startsAt: event.scheduledStartAt
        ? event.scheduledStartAt.toISOString()
        : new Date().toISOString(),
      endsAt: event.scheduledEndAt ? event.scheduledEndAt.toISOString() : null,
      location: event.entityMetadata?.location ?? null,
      channelId: event.channelId ?? null,
      status: statusMap[event.status] ?? 'SCHEDULED',
      entityType: typeMap[event.entityType] ?? 'EXTERNAL',
      createdAt: createdAt.toISOString(),
    };
  }
}
