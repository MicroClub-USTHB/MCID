import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export enum ChannelCreateType {
  TEXT = 'text',
  VOICE = 'voice',
}

export class CreateChannelDto {
  @ApiProperty({
    description: 'Name of the Discord channel',
    example: 'hackathon-2026-general',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name: string;

  @ApiProperty({
    description: 'Type of the channel (text or voice)',
    enum: ChannelCreateType,
    example: 'text',
  })
  @IsEnum(ChannelCreateType, {
    message: 'type must be either text or voice',
  })
  type: ChannelCreateType;

  @ApiPropertyOptional({
    description: 'Discord snowflake ID of the parent category',
    example: '910000000000000002',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{17,20}$/, {
    message: 'parentId must be a valid Discord snowflake ID',
  })
  parentId?: string;
}
