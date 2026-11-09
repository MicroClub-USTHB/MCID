import { PickType } from '@nestjs/swagger';
import { UpdateInboundWebhookDto } from './update-inbound-webhook.dto';

/** The fields a project key may change; origins, signing and roles stay admin-only. */
export class UpdateProjectInboundWebhookDto extends PickType(
  UpdateInboundWebhookDto,
  ['name', 'schema'] as const,
) {}
