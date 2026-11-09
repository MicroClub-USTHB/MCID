import { ApiProperty } from '@nestjs/swagger';

export class ProjectInboundWebhookSummaryDto {
  @ApiProperty({ example: '0b6f5c1e-7d2a-4c8e-9f1a-3e5b7c9d1f20' })
  id: string;

  @ApiProperty({ example: 'Hackathon 2026' })
  name: string;

  @ApiProperty({ example: 'hackathon-2026' })
  slug: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({
    description: 'The webhook FormSchema',
    type: 'object',
    additionalProperties: true,
    example: { version: 1, fields: [] },
  })
  schema: Record<string, unknown>;

  @ApiProperty({
    description: 'ISO 8601 creation timestamp',
    example: '2026-11-01T09:00:00.000Z',
  })
  createdAt: string;
}

export class ProjectInboundWebhookListDto {
  @ApiProperty({ type: [ProjectInboundWebhookSummaryDto] })
  items: ProjectInboundWebhookSummaryDto[];

  @ApiProperty({ description: "All of the project's webhooks", example: 1 })
  total: number;
}

export class ProjectRotatedSecretDto {
  @ApiProperty({
    description: 'The new signing secret, returned once',
    example: 'whsec_3f9a...',
  })
  secret: string;
}

export class ProjectSubmissionDto {
  @ApiProperty({ example: '0b6f5c1e-7d2a-4c8e-9f1a-3e5b7c9d1f20' })
  id: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { name: 'Sara B.' },
  })
  payload: Record<string, unknown>;

  @ApiProperty({ example: '2026-11-20T09:58:00.000Z' })
  receivedAt: string;

  @ApiProperty({ type: String, nullable: true, example: 'event-platform' })
  origin: string | null;
}

export class ProjectSubmissionPageDto {
  @ApiProperty({ type: [ProjectSubmissionDto] })
  items: ProjectSubmissionDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass as `cursor` for the next page. Null at the end.',
  })
  nextCursor: string | null;
}
