import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { IdentitiesService } from './identities.service';
import { IDENTITY_PROVIDER_NAMES } from './identity-providers';
import { ListIdentitiesDto } from './dto/list-identities.dto';

@ApiTags('Identities')
@ApiSecurity('api-key')
@Controller('identities')
@UseGuards(ApiKeyGuard)
export class IdentitiesController {
  constructor(private readonly service: IdentitiesService) {}

  @Get()
  @ApiOperation({
    summary: 'List linked accounts for a provider',
    description:
      'Members who linked an account on the provider, optionally only those holding ' +
      'one of the given Discord roles (e.g. a department role).',
  })
  @ApiQuery({ name: 'provider', enum: IDENTITY_PROVIDER_NAMES })
  @ApiQuery({
    name: 'roleIds',
    required: false,
    description: 'Comma-separated Discord role ids; any one is enough.',
  })
  async list(@Query() query: ListIdentitiesDto) {
    const identities = await this.service.list(query.provider, query.roleIds);
    return { provider: query.provider, count: identities.length, identities };
  }
}
