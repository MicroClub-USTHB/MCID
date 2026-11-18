import { ApiProperty } from '@nestjs/swagger';
import { ChannelCreateType } from './create-channel.dto';

export class CreateChannelResponseDto {
  @ApiProperty({
    description: 'Discord snowflake ID of the created channel',
    example: '910000000000000010',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the channel',
    example: 'hackathon-2026-general',
  })
  name: string;

  @ApiProperty({
    description: 'Type of the channel',
    enum: ChannelCreateType,
    example: 'text',
  })
  type: ChannelCreateType;

  @ApiProperty({
    description:
      'Discord snowflake ID of the parent category, or null if root level',
    example: '910000000000000002',
    nullable: true,
  })
  parentId: string | null;
}
