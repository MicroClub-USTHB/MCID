import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  UseFilters,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiParam,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiBadGatewayResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ChannelsService } from './channels.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ProjectThrottlerGuard } from './guards/project-throttler.guard';
import { SkipGlobalThrottle } from '../../common/guards/app-throttler.guard';
import { RequireScope } from '../../common/decorators/require-scope.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { HideInaccessibleServer } from '../../common/decorators/hide-inaccessible-server.decorator';
import { ChannelsExceptionFilter } from './filters/channels-exception.filter';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import * as schema from '../../database/entities';

interface RequestWithProject extends Request {
  project?: typeof schema.projects.$inferSelect;
}

@ApiTags('Channels')
@ApiSecurity('api-key')
@Controller('servers/:serverId/categories')
@SkipGlobalThrottle()
@UseGuards(ApiKeyGuard, ProjectThrottlerGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@UseFilters(ChannelsExceptionFilter)
export class CategoriesController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @RequireScope('manage_channels')
  @HideInaccessibleServer()
  @Idempotent({ required: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Discord category channel',
    description:
      'Creates a category channel in the Discord server. ' +
      'Requires the manage_channels scope on the server. ' +
      'The Idempotency-Key header is required: retrying with the same key returns the cached response instead of creating it again.',
  })
  @ApiParam({
    name: 'serverId',
    description: 'Discord server ID',
    example: '123456789012345678',
  })
  @ApiCreatedResponse({
    description: 'Category created successfully.',
    type: CategoryResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid category payload or missing Idempotency-Key header.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description:
      'Project does not have the manage_channels scope on this server.',
  })
  @ApiNotFoundResponse({
    description:
      'The project is not mapped to this server, the server does not exist, or the bot cannot reach it.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded.',
  })
  @ApiBadGatewayResponse({
    description: 'Discord rejected the request or bot lacks permissions.',
  })
  async createCategory(
    @Param('serverId') serverId: string,
    @Body() dto: CreateCategoryDto,
    @Req() req: RequestWithProject,
  ): Promise<CategoryResponseDto> {
    const projectId = req.project?.id;
    return this.channelsService.createCategory(projectId, serverId, dto);
  }
}
