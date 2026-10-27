import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SYNC_CHANGE_ACTIONS, type SyncChangeAction } from '@mcid/contracts';

/**
 * Query parameters for `GET /admin/sync/logs/:syncLogId/changes`.
 *
 * The action value is validated against the contract enum, so a typo is a
 * 400 instead of a silently empty page.
 */
export class SyncChangesQueryDto {
  @ApiPropertyOptional({
    default: 100,
    description: 'Max results to return (1-100)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 100;

  @ApiPropertyOptional({ default: 0, description: 'Number of records to skip' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset: number = 0;

  @ApiPropertyOptional({
    enum: SYNC_CHANGE_ACTIONS,
    description:
      'Filter changes by what happened (added, removed, updated, ...)',
  })
  @IsOptional()
  @IsIn(SYNC_CHANGE_ACTIONS)
  action?: SyncChangeAction;
}
