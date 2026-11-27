import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';
import {
  IDENTITY_PROVIDER_NAMES,
  type IdentityProvider,
} from '../identity-providers';

export class ListIdentitiesDto {
  @IsIn(IDENTITY_PROVIDER_NAMES)
  provider!: IdentityProvider;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(25)
  @Matches(/^\d{17,20}$/, {
    each: true,
    message: 'each role id must be a Discord snowflake',
  })
  roleIds?: string[];
}
