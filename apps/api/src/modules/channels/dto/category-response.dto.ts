import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({
    description: 'Discord snowflake ID of the created category',
    example: '910000000000000002',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the category',
    example: 'Hackathon 2026',
  })
  name: string;
}
