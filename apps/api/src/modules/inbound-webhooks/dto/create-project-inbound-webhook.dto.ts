import { ApiProperty } from '@nestjs/swagger';
import { OmitType } from '@nestjs/swagger';
import { CreateInboundWebhookDto } from './create-inbound-webhook.dto';

/** The admin create body without `projectId`: the project comes from the API key. */
export class CreateProjectInboundWebhookDto extends OmitType(
  CreateInboundWebhookDto,
  ['projectId'] as const,
) {}

export class CreatedProjectInboundWebhookDto {
  @ApiProperty({ example: '0b6f5c1e-7d2a-4c8e-9f1a-3e5b7c9d1f20' })
  id: string;

  @ApiProperty({ example: 'hackathon-2026' })
  slug: string;

  @ApiProperty({
    description: 'The signing secret. Shown once; no later read returns it.',
    example: 'whsec_9f2c…',
  })
  secret: string;
}
