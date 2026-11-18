import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateScheduledEventDto {
  @ApiPropertyOptional({
    description: 'Updated name of the scheduled event (1 to 100 characters)',
    example: 'Hackathon 2026 - Finale',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Updated description of the scheduled event (up to 1000 characters)',
    example: 'Updated description',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated start time in ISO 8601 format',
    example: '2026-12-05T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Updated end time in ISO 8601 format',
    example: '2026-12-06T18:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description: 'Updated external location (1 to 100 characters)',
    example: 'USTHB Cyber Espace',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({
    description: 'Updated Discord Voice or Stage channel ID',
    example: '910000000000000010',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{17,20}$/, {
    message: 'channelId must be a valid Discord snowflake',
  })
  channelId?: string;
}
