import { ApiProperty } from '@nestjs/swagger';

export class ProjectRoleResponseDto {
  @ApiProperty({
    description: 'Discord snowflake ID of the created role',
    example: '123456789012345678',
  })
  id: string;

  @ApiProperty({
    description: 'Discord server ID',
    example: '987654321098765432',
  })
  serverId: string;

  @ApiProperty({
    description: 'Name of the role',
    example: 'Event Participant',
  })
  name: string;

  @ApiProperty({
    description: 'Role color as integer',
    example: 3447003,
    nullable: true,
  })
  color: number | null;

  @ApiProperty({
    description: 'Whether the role is mentionable',
    example: false,
  })
  mentionable: boolean;

  @ApiProperty({
    description: 'Role position in the hierarchy',
    example: 1,
  })
  position: number;

  @ApiProperty({
    description: 'Timestamp when the role was created in MCID',
    example: '2026-11-14T00:00:00.000Z',
  })
  createdAt: string;
}
