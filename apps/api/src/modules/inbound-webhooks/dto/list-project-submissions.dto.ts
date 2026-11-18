import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProjectSubmissionsDto {
  @ApiProperty({
    description:
      'Discord server on which the project holds the `read_inbound_submissions` scope.',
    example: '123456789012345678',
  })
  @IsString()
  serverId: string;

  @ApiPropertyOptional({
    description: 'Opaque `nextCursor` of the previous page.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'ISO 8601 - submissions received at or after it.',
    example: '2026-03-01T00:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @ApiPropertyOptional({
    description: 'ISO 8601 - submissions received at or before it.',
    example: '2026-04-01T00:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
