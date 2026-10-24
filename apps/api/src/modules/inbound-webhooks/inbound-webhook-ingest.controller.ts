import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiSecurity,
  ApiTags,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SkipGlobalThrottle } from '../../common/guards/app-throttler.guard';
import {
  IngestContext,
  InboundWebhooksService,
} from './inbound-webhooks.service';
import type { SubmitBody } from './dto/submit.dto';

type ProjectRequest = RawBodyRequest<Request> & {
  project?: { id: string };
};

/**
 * Write-only surface, authenticated by the project's API key.
 *
 * Deliberately exposes no read route: a project submits, it does not read
 * back accumulated submissions. Reading is gated on Discord roles instead,
 * on a separate controller behind a separate guard.
 */
@ApiTags('Inbound Webhooks (Ingest)')
@ApiSecurity('api-key')
// Has its own Redis limit (per webhook and per project)
@SkipGlobalThrottle()
@Controller('inbound-webhooks')
@UseGuards(ApiKeyGuard)
export class InboundWebhookIngestController {
  constructor(private readonly service: InboundWebhooksService) {}

  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a payload',
    description:
      'Validated against the webhook schema. Every field error is returned at once.',
  })
  @ApiParam({ name: 'id' })
  @ApiHeader({
    name: 'X-MCID-Signature',
    required: false,
    description: 't=<unix seconds>,v1=<hex hmac-sha256 of "t.<raw body>">',
  })
  @ApiCreatedResponse({ description: 'Accepted.' })
  @ApiBadRequestResponse({
    description: 'Bad signature (401) or rate limited (429).',
  })
  @ApiForbiddenResponse({ description: 'Origin not in the allowlist.' })
  @ApiNotFoundResponse({ description: 'No such webhook for this project.' })
  @ApiConflictResponse({ description: 'Signature replayed.' })
  @ApiGoneResponse({ description: 'Webhook is inactive.' })
  @ApiUnprocessableEntityResponse({
    description: 'Payload failed schema validation.',
  })
  async submit(
    @Param('id') id: string,
    @Body() body: SubmitBody,
    @Req() req: ProjectRequest,
  ) {
    return this.service.ingest(id, body ?? {}, this.context(req));
  }

  @Post(':id/files')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload a file',
    description:
      "Phase one of a file submission. Send one file as multipart/form-data; the response carries a fileId to reference from a file field in /submit or in a draft step. The type is read from the content, not from the Content-Type the sender gives, and must be accepted by one of the webhook's file fields. The upload expires after INBOUND_WEBHOOK_FILE_TTL_H hours (1 by default) unless a submission uses it. The multipart body is not signed, so the signature covers an empty string.",
  })
  @ApiParam({ name: 'id' })
  @ApiHeader({
    name: 'X-MCID-Signature',
    required: false,
    description: 't=<unix seconds>,v1=<hex hmac-sha256 of "t.">',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({
    description: 'The fileId, sha256, size, detected mime and expiry.',
  })
  @ApiBadRequestResponse({
    description:
      'Not multipart, no file, several files, an empty file, or the webhook has no file fields (400); bad signature (401).',
  })
  @ApiForbiddenResponse({ description: 'Origin not in the allowlist.' })
  @ApiNotFoundResponse({ description: 'No such webhook for this project.' })
  @ApiConflictResponse({ description: 'Signature replayed.' })
  @ApiGoneResponse({ description: 'Webhook is inactive.' })
  @ApiPayloadTooLargeResponse({
    description: 'Larger than the biggest maxSizeBytes of the webhook.',
  })
  @ApiUnsupportedMediaTypeResponse({
    description: 'The content is not a type the webhook accepts.',
  })
  uploadFile(@Param('id') id: string, @Req() req: ProjectRequest) {
    return this.service.uploadFile(id, req, this.context(req));
  }

  @Post(':id/drafts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Open a draft',
    description:
      'Starts a multi-step submission. Send each step with PATCH, then submit the draft. The draft expires after INBOUND_WEBHOOK_DRAFT_TTL_H hours (24 by default). Only for webhooks whose schema has steps. The request has no body, so the signature covers an empty string.',
  })
  @ApiParam({ name: 'id' })
  @ApiHeader({
    name: 'X-MCID-Signature',
    required: false,
    description: 't=<unix seconds>,v1=<hex hmac-sha256 of "t.<raw body>">',
  })
  @ApiCreatedResponse({ description: 'The draft id and when it expires.' })
  @ApiBadRequestResponse({
    description:
      'The webhook has no steps (400), or the signature is bad (401).',
  })
  @ApiForbiddenResponse({ description: 'Origin not in the allowlist.' })
  @ApiNotFoundResponse({ description: 'No such webhook for this project.' })
  @ApiConflictResponse({ description: 'Signature replayed.' })
  @ApiGoneResponse({ description: 'Webhook is inactive.' })
  createDraft(@Param('id') id: string, @Req() req: ProjectRequest) {
    return this.service.createDraft(id, this.context(req));
  }

  @Patch(':id/drafts/:draftId/:stepKey')
  @ApiOperation({
    summary: 'Save one step of a draft',
    description:
      'Checks only this step, with its conditions read against the steps already saved, and stores it. Sending a step again replaces it. Every error in the step is returned at once.',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'draftId' })
  @ApiParam({ name: 'stepKey' })
  @ApiHeader({
    name: 'X-MCID-Signature',
    required: false,
    description: 't=<unix seconds>,v1=<hex hmac-sha256 of "t.<raw body>">',
  })
  @ApiOkResponse({ description: 'The steps saved so far.' })
  @ApiForbiddenResponse({ description: 'Origin not in the allowlist.' })
  @ApiNotFoundResponse({ description: 'No such webhook or draft.' })
  @ApiConflictResponse({
    description: 'The draft was already submitted, or the signature replayed.',
  })
  @ApiGoneResponse({ description: 'Webhook inactive, or the draft expired.' })
  @ApiUnprocessableEntityResponse({
    description: 'The step failed schema validation, or the step is unknown.',
  })
  patchDraftStep(
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Param('stepKey') stepKey: string,
    @Body() body: SubmitBody,
    @Req() req: ProjectRequest,
  ) {
    return this.service.patchDraftStep(
      id,
      draftId,
      stepKey,
      body ?? {},
      this.context(req),
    );
  }

  @Post(':id/drafts/:draftId/submit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a draft',
    description:
      'Checks everything saved so far as one payload, with conditions resolved across steps, and turns the draft into a submission. A step never sent fails its required fields. A draft can be submitted once. The request has no body, so the signature covers an empty string.',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'draftId' })
  @ApiHeader({
    name: 'X-MCID-Signature',
    required: false,
    description: 't=<unix seconds>,v1=<hex hmac-sha256 of "t.<raw body>">',
  })
  @ApiCreatedResponse({ description: 'Accepted.' })
  @ApiForbiddenResponse({ description: 'Origin not in the allowlist.' })
  @ApiNotFoundResponse({ description: 'No such webhook or draft.' })
  @ApiConflictResponse({
    description: 'The draft was already submitted, or the signature replayed.',
  })
  @ApiGoneResponse({ description: 'Webhook inactive, or the draft expired.' })
  @ApiUnprocessableEntityResponse({
    description: 'The accumulated payload failed schema validation.',
  })
  submitDraft(
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Req() req: ProjectRequest,
  ) {
    return this.service.submitDraft(id, draftId, this.context(req));
  }

  private context(req: ProjectRequest): IngestContext {
    return {
      projectId: req.project?.id ?? '',
      // A request without a body has no raw body, and signs the empty string
      rawBody: req.rawBody ?? Buffer.alloc(0),
      signatureHeader: req.headers['x-mcid-signature'] as string | undefined,
      origin: req.headers.origin,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
