import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiPropertyOptional({
    description:
      'Seconds until the invite expires (0 = never). Discord default when omitted: 86400 (24 hours).',
    example: 604800,
    minimum: 0,
    maximum: 604800,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(604800)
  maxAgeSeconds?: number;

  @ApiPropertyOptional({
    description:
      'Maximum number of uses (0 = unlimited, the Discord default when omitted).',
    example: 0,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxUses?: number;
}

export class InviteResponseDto {
  @ApiProperty({ description: 'Invite code', example: 'abc123' })
  code: string;

  @ApiProperty({
    description: 'Invite URL',
    example: 'https://discord.gg/abc123',
  })
  url: string;

  @ApiProperty({
    description: 'Expiry (ISO 8601), null when the invite never expires',
    example: '2026-12-01T00:00:00.000Z',
    nullable: true,
    type: String,
  })
  expiresAt: string | null;
}
