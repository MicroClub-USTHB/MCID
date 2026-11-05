import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ProjectServerQueryDto {
  @ApiProperty({
    description:
      'Discord server on which the project holds the `read_inbound_submissions` scope.',
    example: '123456789012345678',
  })
  @IsString()
  serverId: string;
}
