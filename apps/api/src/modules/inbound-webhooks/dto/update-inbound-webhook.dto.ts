import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { IdentityMappingDto } from './create-inbound-webhook.dto';

export class UpdateInboundWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Either `steps` or flat `fields`, not both; re-validated on update.',
  })
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedOrigins?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireSignature?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rejectUnknownFields?: boolean;

  @ApiPropertyOptional({
    description:
      'Let role inheritance rules grant read access to this webhook. See the create request for the rule.',
  })
  @IsOptional()
  @IsBoolean()
  allowRoleInheritance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Set the identity mapping, or send null to remove it.',
    type: IdentityMappingDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => IdentityMappingDto)
  identityMapping?: IdentityMappingDto | null;
}
