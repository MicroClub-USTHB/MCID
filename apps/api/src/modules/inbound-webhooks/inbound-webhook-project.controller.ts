import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiUnprocessableEntityResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { RequireScope } from '../../common/decorators/require-scope.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SkipGlobalThrottle } from '../../common/guards/app-throttler.guard';
import { ProjectThrottlerGuard } from '../channels/guards/project-throttler.guard';
import {
  CreatedProjectInboundWebhookDto,
  CreateProjectInboundWebhookDto,
} from './dto/create-project-inbound-webhook.dto';
import { ListProjectInboundWebhooksDto } from './dto/list-project-inbound-webhooks.dto';
import { ProjectServerQueryDto } from './dto/project-server-query.dto';
import { ListProjectSubmissionsDto } from './dto/list-project-submissions.dto';
import {
  ProjectInboundWebhookSummaryDto,
  ProjectRotatedSecretDto,
  ProjectSubmissionDto,
  ProjectSubmissionPageDto,
  ProjectInboundWebhookListDto,
} from './dto/project-inbound-webhook-response.dto';
import { UpdateProjectInboundWebhookDto } from './dto/update-project-inbound-webhook.dto';
import { InboundWebhookRow } from './inbound-webhooks.repository';
import { InboundWebhooksService } from './inbound-webhooks.service';

/** The only webhook fields a project sees: no secret, settings or counters. */
const toSummary = (w: InboundWebhookRow): ProjectInboundWebhookSummaryDto => ({
  id: w.id,
  name: w.name,
  slug: w.slug,
  active: w.isActive,
  schema: w.schema as unknown as Record<string, unknown>,
  createdAt: w.createdAt.toISOString(),
});

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
    return { items: rows.map(toSummary), total };
  }

  @Patch(':id')
  @ApiOperation({
    summary: "Update a webhook's name or schema",
    description:
      'Same schema rules as the admin update. Audited with the project id.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({
    description: 'The updated webhook, in the list projection.',
    type: ProjectInboundWebhookSummaryDto,
  })
  @ApiBadRequestResponse({ description: 'Unknown or malformed field.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiNotFoundResponse({ description: 'No such webhook for this project.' })
  @ApiUnprocessableEntityResponse({ description: 'The schema is invalid.' })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectInboundWebhookDto,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<ProjectInboundWebhookSummaryDto> {
    return toSummary(
      await this.service.updateForProject(req.project!.id, id, dto),
    );
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the signing secret',
    description:
      'The new secret is returned once and the old one stops verifying. Audited with the project id.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({
    description: 'The new secret, shown once.',
    type: ProjectRotatedSecretDto,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiNotFoundResponse({ description: 'No such webhook for this project.' })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  async rotateSecret(
    @Param('id') id: string,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<ProjectRotatedSecretDto> {
    const secret = await this.service.rotateSecretForProject(
      req.project!.id,
      id,
    );
    return { secret };
  }

  @Post()
  @ApiOperation({
    summary: 'Create an inbound webhook for the project',
    description:
      "The project comes from the API key; a `projectId` in the body is rejected. Same schema rules as the admin create, and `allowedRoleIds` must belong to the project's servers (omit it for the default reader roles). The signing secret is returned once.",
  })
  @ApiCreatedResponse({ type: CreatedProjectInboundWebhookDto })
  @ApiBadRequestResponse({ description: 'Invalid input or reader roles.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiConflictResponse({ description: 'Slug already used in this project.' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid schema; `errors` lists every problem.',
  })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  create(
    @Body() dto: CreateProjectInboundWebhookDto,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<CreatedProjectInboundWebhookDto> {
    return this.service.createForProject(req.project!.id, dto);
  }

  @Get(':id/submissions')
  @RequireScope('read_inbound_submissions')
  @ApiOperation({
    summary: "List a webhook's submissions after a cursor",
    description:
      'Oldest first, keyset-paged on (receivedAt, id), so rows arriving between pages are neither skipped nor repeated. Every read is audited. Requires the `read_inbound_submissions` scope on the `serverId` given in the query.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: ProjectSubmissionPageDto })
  @ApiBadRequestResponse({ description: 'Malformed cursor or query.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description:
      'The project lacks the `read_inbound_submissions` scope or read access on `serverId`.',
  })
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

  @Get(':id/submissions/:submissionId')
  @RequireScope('read_inbound_submissions')
  @ApiOperation({
    summary: "Get one of a webhook's submissions",
    description:
      'Same fields as a list item. Every read is audited. Requires the `read_inbound_submissions` scope on the `serverId` given in the query.',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'submissionId' })
  @ApiOkResponse({ type: ProjectSubmissionDto })
  @ApiBadRequestResponse({ description: 'Malformed submission id or query.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
  @ApiForbiddenResponse({
    description:
      'The project lacks the `read_inbound_submissions` scope or read access on `serverId`.',
  })
  @ApiNotFoundResponse({
    description:
      'No such webhook or submission for this project (never says which).',
  })
  @ApiTooManyRequestsResponse({ description: 'Project rate limit.' })
  getSubmission(
    @Param('id') id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Query() _query: ProjectServerQueryDto,
    @Req() req: Request & { project?: { id: string } },
  ): Promise<ProjectSubmissionDto> {
    return this.service.getSubmissionForProject(
      id,
      submissionId,
      req.project!.id,
    );
  }
}
