import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ProjectThrottlerGuard } from '../channels/guards/project-throttler.guard';
import { RequireScope } from '../../common/decorators/require-scope.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { ProjectScheduledEventsService } from './project-scheduled-events.service';
import { CreateScheduledEventDto } from './dto/create-scheduled-event.dto';
import { UpdateScheduledEventDto } from './dto/update-scheduled-event.dto';
import { ScheduledEventResponseDto } from './dto/scheduled-event-response.dto';
import * as schema from '../../database/entities';

interface RequestWithProject extends Request {
  project?: typeof schema.projects.$inferSelect;
}

@ApiTags('Scheduled Events')
@ApiSecurity('api-key')
@Controller('servers/:serverId/scheduled-events')
@UseGuards(ApiKeyGuard, ProjectThrottlerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProjectScheduledEventsController {
  constructor(private readonly service: ProjectScheduledEventsService) {}

  @Post()
  @RequireScope('manage_events')
  @Idempotent()
  @ApiOperation({
    summary: 'Create a Discord scheduled event',
    description:
      'Creates a scheduled event in the Discord server (external location or channel) ' +
      'and records project ownership. Retrying with the same Idempotency-Key header returns ' +
      'the cached response without creating a duplicate event on Discord.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  @ApiCreatedResponse({
    description: 'Scheduled event created successfully',
    type: ScheduledEventResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input payload, time range or entity parameters',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiForbiddenResponse({
    description: 'Project lacks manage_events scope on this server',
  })
  @ApiNotFoundResponse({ description: 'Server or channel not found' })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit exceeded' })
  @ApiBadGatewayResponse({
    description: 'Discord rejected the request or bot lacks permissions',
  })
  async createEvent(
    @Param('serverId') serverId: string,
    @Body() dto: CreateScheduledEventDto,
    @Req() req: RequestWithProject,
  ): Promise<ScheduledEventResponseDto> {
    const projectId = req.project?.id;
    return this.service.createEvent(projectId!, serverId, dto);
  }

  @Patch(':eventId')
  @RequireScope('manage_events')
  @ApiOperation({
    summary: 'Update a Discord scheduled event',
    description:
      'Updates a scheduled event on Discord. Projects can only update scheduled events ' +
      'they previously created; attempts to update an event created by another project or ' +
      'created manually on Discord will return 404.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  @ApiParam({
    name: 'eventId',
    description: 'Discord scheduled event ID',
    example: '920000000000000001',
  })
  @ApiOkResponse({
    description: 'Scheduled event updated successfully',
    type: ScheduledEventResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid update parameters or time range',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiForbiddenResponse({
    description: 'Project lacks manage_events scope on this server',
  })
  @ApiNotFoundResponse({
    description: 'Scheduled event not found or not owned by this project',
  })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit exceeded' })
  @ApiBadGatewayResponse({
    description: 'Discord rejected the request or bot lacks permissions',
  })
  async updateEvent(
    @Param('serverId') serverId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateScheduledEventDto,
    @Req() req: RequestWithProject,
  ): Promise<ScheduledEventResponseDto> {
    const projectId = req.project?.id;
    return this.service.updateEvent(projectId!, serverId, eventId, dto);
  }

  @Delete(':eventId')
  @RequireScope('manage_events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a Discord scheduled event',
    description:
      'Cancels and deletes a scheduled event from Discord and removes its MCID ownership record. ' +
      'Projects can only delete scheduled events they previously created; other events return 404.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  @ApiParam({
    name: 'eventId',
    description: 'Discord scheduled event ID',
    example: '920000000000000001',
  })
  @ApiNoContentResponse({ description: 'Scheduled event deleted successfully' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  @ApiForbiddenResponse({
    description: 'Project lacks manage_events scope on this server',
  })
  @ApiNotFoundResponse({
    description: 'Scheduled event not found or not owned by this project',
  })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit exceeded' })
  @ApiBadGatewayResponse({
    description: 'Discord rejected the request or bot lacks permissions',
  })
  async deleteEvent(
    @Param('serverId') serverId: string,
    @Param('eventId') eventId: string,
    @Req() req: RequestWithProject,
  ): Promise<void> {
    const projectId = req.project?.id;
    await this.service.deleteEvent(projectId!, serverId, eventId);
  }
}
