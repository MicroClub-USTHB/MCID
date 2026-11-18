import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProjectRoleDto {
  @ApiProperty({
    description: 'Name of the Discord role to create',
    example: 'Event Participant',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'RGB color as integer (0 to 16777215)',
    example: 3447003,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(16777215)
  color?: number;

  @ApiPropertyOptional({
    description: 'Whether the role can be mentioned by anyone',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  mentionable?: boolean;
}
