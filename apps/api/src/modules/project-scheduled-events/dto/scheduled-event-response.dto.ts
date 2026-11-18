import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScheduledEventResponseDto {
  @ApiProperty({
    description: 'Discord scheduled event snowflake ID',
    example: '920000000000000001',
  })
  id: string;

  @ApiProperty({
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  serverId: string;

  @ApiProperty({
    description: 'Name of the scheduled event',
    example: 'Hackathon 2026',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the scheduled event',
    example: 'Annual Micro Club Hackathon',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Start time in ISO 8601 format',
    example: '2026-12-05T09:00:00.000Z',
  })
  startsAt: string;

  @ApiPropertyOptional({
    description: 'End time in ISO 8601 format',
    example: '2026-12-06T09:00:00.000Z',
    nullable: true,
  })
  endsAt: string | null;

  @ApiPropertyOptional({
    description: 'External location name',
    example: 'USTHB',
    nullable: true,
  })
  location: string | null;

  @ApiPropertyOptional({
    description: 'Discord channel ID for voice/stage event',
    example: '910000000000000010',
    nullable: true,
  })
  channelId: string | null;

  @ApiProperty({
    description: 'Current status of the scheduled event',
    example: 'SCHEDULED',
    enum: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELED'],
  })
  status: string;

  @ApiProperty({
    description: 'Entity type of the scheduled event',
    example: 'EXTERNAL',
    enum: ['STAGE_INSTANCE', 'VOICE', 'EXTERNAL'],
  })
  entityType: string;

  @ApiProperty({
    description: 'Timestamp when this event was recorded in MCID',
    example: '2026-11-17T18:00:00.000Z',
  })
  createdAt: string;
}
