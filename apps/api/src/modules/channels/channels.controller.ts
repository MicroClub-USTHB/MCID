import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  UseFilters,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiBadGatewayResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SkipGlobalThrottle } from '../../common/guards/app-throttler.guard';
import { ChannelsService } from './channels.service';
import { ChannelAccessGuard } from './guards/channel-access.guard';
import { ProjectThrottlerGuard } from './guards/project-throttler.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { RequireProjectOperation } from '../../common/decorators/require-project-operation.decorator';
import { RequireScope } from '../../common/decorators/require-scope.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { HideInaccessibleServer } from '../../common/decorators/hide-inaccessible-server.decorator';
import { CreateInviteDto, InviteResponseDto } from './dto/create-invite.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ListChannelsQueryDto } from './dto/list-channels-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendMessageResponseDto } from './dto/message-response.dto';
import {
  ChannelListResponseDto,
  ChannelDetailResponseDto,
} from './dto/channel-response.dto';
import { GetMessagesResponseDto } from './dto/message-response.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateChannelResponseDto } from './dto/create-channel-response.dto';
import { ChannelsExceptionFilter } from './filters/channels-exception.filter';
import * as schema from '../../database/entities';

interface RequestWithProject extends Request {
  project?: typeof schema.projects.$inferSelect;
}

@ApiTags('Channels')
@ApiSecurity('api-key')
@Controller('servers/:serverId/channels')
@UseGuards(ApiKeyGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@UseFilters(ChannelsExceptionFilter)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @RequireScope('manage_channels')
  @HideInaccessibleServer()
  @Idempotent({ required: true })
  @SkipGlobalThrottle()
  @UseGuards(ProjectThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Discord channel',
    description:
      'Creates a text or voice channel in the Discord server, optionally under a parent category. ' +
      'Requires the manage_channels scope on the server. ' +
      'The Idempotency-Key header is required: retrying with the same key returns the cached response instead of creating it again.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiCreatedResponse({
    description: 'Channel created successfully.',
    type: CreateChannelResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid channel payload, parent is not a category, or missing Idempotency-Key header.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description:
      'Project does not have the manage_channels scope on this server.',
  })
  @ApiNotFoundResponse({
    description:
      'The project is not mapped to this server, the server does not exist, or the parent category is not in it.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded.',
  })
  @ApiBadGatewayResponse({
    description: 'Discord rejected the request or bot lacks permissions.',
  })
  async createChannel(
    @Param('serverId') serverId: string,
    @Body() dto: CreateChannelDto,
    @Req() req: RequestWithProject,
  ): Promise<CreateChannelResponseDto> {
    const projectId = req.project?.id;
    return this.channelsService.createChannel(projectId, serverId, dto);
  }

  @Get()
  @RequireProjectOperation('READ')
  @ApiOperation({
    summary: 'List all channels in a server',
    description:
      'Returns all channels the bot can access in the server, with categories.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['all', 'text', 'voice', 'announcement', 'category'],
    description: 'Filter by channel type',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by parent category ID',
    example: '123456789012345678',
  })
  @ApiOkResponse({
    description: 'List of channels and categories.',
    type: ChannelListResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description: 'Project does not have READ access to this server.',
  })
  @ApiNotFoundResponse({
    description: 'Server not found or bot not connected.',
  })
  async listChannels(
    @Param('serverId') serverId: string,
    @Query() query: ListChannelsQueryDto,
  ): Promise<ChannelListResponseDto> {
    return this.channelsService.listChannels(serverId, query);
  }

  @Get(':channelId')
  @RequireProjectOperation('READ')
  @UseGuards(ChannelAccessGuard)
  @ApiOperation({
    summary: 'Get channel details',
    description: 'Returns detailed information about a specific channel.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiParam({
    name: 'channelId',
    description: 'Discord channel ID',
    example: '123456789012345678',
  })
  @ApiOkResponse({
    description: 'Channel details.',
    type: ChannelDetailResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid channel ID format.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description: 'Project does not have READ access to this server.',
  })
  @ApiNotFoundResponse({
    description: 'Channel does not exist or bot lacks access.',
  })
  async getChannel(
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
  ): Promise<ChannelDetailResponseDto> {
    return this.channelsService.getChannel(serverId, channelId);
  }

  @Get(':channelId/messages')
  @RequireProjectOperation('READ')
  @SkipGlobalThrottle()
  @UseGuards(ProjectThrottlerGuard, ChannelAccessGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Get recent messages from a channel',
    description:
      'Retrieves message history from a text channel. Supports pagination and author filtering.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiParam({
    name: 'channelId',
    description: 'Discord channel ID',
    example: '123456789012345678',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max number of messages (1-100)',
    example: 50,
  })
  @ApiQuery({
    name: 'before',
    required: false,
    type: String,
    description: 'Get messages before this Discord snowflake ID',
    example: '123456789012345678',
  })
  @ApiQuery({
    name: 'after',
    required: false,
    type: String,
    description: 'Get messages after this Discord snowflake ID',
    example: '123456789012345678',
  })
  @ApiQuery({
    name: 'authorId',
    required: false,
    type: String,
    description: 'Filter by author Discord ID',
    example: '123456789012345678',
  })
  @ApiOkResponse({
    description: 'List of messages.',
    type: GetMessagesResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description: 'Project does not have READ access to this server.',
  })
  @ApiNotFoundResponse({
    description: 'Channel does not exist or bot lacks access.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded. 10 requests per minute per project.',
  })
  async getMessages(
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<GetMessagesResponseDto> {
    return this.channelsService.getMessages(serverId, channelId, query);
  }

  @Post(':channelId/messages')
  @RequireProjectOperation('SEND_MESSAGES')
  @SkipGlobalThrottle()
  @UseGuards(ProjectThrottlerGuard, ChannelAccessGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a message to a Discord channel',
    description:
      'Sends a message with optional embeds and mention configuration.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiParam({
    name: 'channelId',
    description: 'Discord channel ID',
    example: '123456789012345678',
  })
  @ApiCreatedResponse({
    description: 'Message sent successfully.',
    type: SendMessageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid message content or embed validation failed.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description:
      'Project does not have SEND_MESSAGES operation on this server.',
  })
  @ApiNotFoundResponse({
    description: 'Channel does not exist or bot lacks access.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded. 5 messages per minute per project.',
  })
  async sendMessage(
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    return this.channelsService.sendMessage(serverId, channelId, dto);
  }

  @Post(':channelId/invites')
  @RequireScope('manage_channels')
  @Idempotent()
  @SkipGlobalThrottle()
  @UseGuards(ProjectThrottlerGuard, ChannelAccessGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a channel invite',
    description:
      'Creates a Discord invite for a channel of a server the project may access. ' +
      'Retrying with the same Idempotency-Key returns the cached invite instead of creating another one.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiParam({
    name: 'channelId',
    description: 'Discord channel ID',
    example: '123456789012345678',
  })
  @ApiCreatedResponse({
    description: 'Invite created.',
    type: InviteResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid invite options.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description: 'Project lacks the manage_channels scope on this server.',
  })
  @ApiNotFoundResponse({
    description: 'Channel does not exist in this server or bot lacks access.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded. 5 invites per minute per project.',
  })
  @ApiBadGatewayResponse({
    description: 'Discord rejected the request or the bot lacks permission.',
  })
  async createInvite(
    @Param('serverId') serverId: string,
    @Param('channelId') channelId: string,
    @Body() dto: CreateInviteDto,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<InviteResponseDto> {
    return this.channelsService.createInvite(
      req.project!.id,
      serverId,
      channelId,
      dto,
    );
  }
}
