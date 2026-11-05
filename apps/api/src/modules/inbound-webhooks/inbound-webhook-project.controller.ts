import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SkipGlobalThrottle } from '../../common/guards/app-throttler.guard';
import { ProjectThrottlerGuard } from '../channels/guards/project-throttler.guard';
import { ListProjectInboundWebhooksDto } from './dto/list-project-inbound-webhooks.dto';
import { ListProjectSubmissionsDto } from './dto/list-project-submissions.dto';
import {
  ProjectSubmissionPageDto,
  ProjectInboundWebhookListDto,
} from './dto/project-inbound-webhook-response.dto';
import { InboundWebhooksService } from './inbound-webhooks.service';

/**
 * Read-only listing of the calling project's own webhooks, so a backend can
 * resolve a form to its webhook by slug. The project comes from the API key,
 * never from the request, and the projection carries no signing secret.
 */
@ApiTags('Inbound Webhooks (Project)')
@ApiSecurity('api-key')
@SkipGlobalThrottle()
@Controller('project/inbound-webhooks')
@UseGuards(ApiKeyGuard, ProjectThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class InboundWebhookProjectController {
  constructor(private readonly service: InboundWebhooksService) {}

  @Get()
  @ApiOperation({
    summary: "List the project's own inbound webhooks",
    description:
      "Ordered by creation time, oldest first. Never returns a signing secret or another project's webhook.",
  })
  @ApiOkResponse({
    description: 'The requested page.',
    type: ProjectInboundWebhookListDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid `limit` or `offset`.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  async list(
    @Query() query: ListProjectInboundWebhooksDto,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<ProjectInboundWebhookListDto> {
    const { rows, total } = await this.service.listForProject(
      req.project!.id,
      query.limit ?? 50,
      query.offset ?? 0,
    );
    return {
      items: rows.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        active: w.isActive,
        schema: w.schema as unknown as Record<string, unknown>,
        createdAt: w.createdAt.toISOString(),
      })),
      total,
    };
  }

  @Get(':id/submissions')
  @ApiOperation({
    summary: "List a webhook's submissions after a cursor",
    description:
      'Oldest first, keyset-paged on (receivedAt, id), so rows arriving between pages are neither skipped nor repeated. Every read is audited.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: ProjectSubmissionPageDto })
  @ApiBadRequestResponse({ description: 'Malformed cursor or query.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiNotFoundResponse({
    description: 'No such webhook for this project.',
  })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  listSubmissions(
    @Param('id') id: string,
    @Query() query: ListProjectSubmissionsDto,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<ProjectSubmissionPageDto> {
    return this.service.listSubmissionsForProject(id, req.project!.id, {
      limit: query.limit ?? 50,
      cursor: query.cursor,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }
}
