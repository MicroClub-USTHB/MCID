import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
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
  @ApiOkResponse({ description: '`{ items, total }` for the requested page.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({ description: 'The project lacks access.' })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  async list(
    @Query() query: ListProjectInboundWebhooksDto,
    @Req() req: Request & { project?: { id: string } },
  ) {
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
        schema: w.schema,
        createdAt: w.createdAt,
      })),
      total,
    };
  }
}
