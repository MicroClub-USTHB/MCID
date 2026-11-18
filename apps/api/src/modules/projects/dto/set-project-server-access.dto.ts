import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectScope } from './create-project.dto';

export class AccessOperationsDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  READ?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  SEND_MESSAGES?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  MANAGE_WEBHOOKS?: boolean;
}

export class SetProjectServerAccessDto {
  @ApiPropertyOptional({ type: AccessOperationsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessOperationsDto)
  operations?: AccessOperationsDto;

  @ApiPropertyOptional({
    description:
      'Scopes granted to this project for this server. ' +
      'If omitted, keeps the current scopes, or for a new grant every scope ' +
      'except the opt-in scopes (manage_roles, manage_channels, manage_events).',
    example: ['read_members', 'check_permissions'],
    enum: ProjectScope,
    isArray: true,
  })
  @IsArray()
  @IsEnum(ProjectScope, { each: true })
  @IsOptional()
  scopes?: ProjectScope[];
}
