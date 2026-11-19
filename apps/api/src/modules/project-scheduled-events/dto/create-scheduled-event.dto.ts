import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateScheduledEventDto {
  @ApiProperty({
    description: 'Name of the scheduled event (1 to 100 characters)',
    example: 'Hackathon 2026',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the scheduled event (up to 1000 characters)',
    example: 'Annual Micro Club Hackathon',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Start time in ISO 8601 format',
    example: '2026-12-05T09:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startsAt: string;

  @ApiPropertyOptional({
    description:
      'End time in ISO 8601 format (required for external events, must be after startsAt)',
    example: '2026-12-06T09:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description:
      'External location name (1 to 100 characters). Exactly one of location or channelId must be provided.',
    example: 'USTHB',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({
    description:
      'Discord Voice or Stage channel ID. Exactly one of location or channelId must be provided.',
    example: '910000000000000010',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{17,20}$/, {
    message: 'channelId must be a valid Discord snowflake',
  })
  channelId?: string;
}
