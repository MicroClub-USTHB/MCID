import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SyncChangesQueryDto } from './sync-changes-query.dto';

describe('SyncChangesQueryDto', () => {
  it('applies the endpoint defaults for an empty query', () => {
    const dto = plainToInstance(SyncChangesQueryDto, {});
    expect(dto.limit).toBe(100);
    expect(dto.offset).toBe(0);
    expect(dto.action).toBeUndefined();
  });

  it('coerces numeric strings from the query string', () => {
    const dto = plainToInstance(SyncChangesQueryDto, {
      limit: '50',
      offset: '10',
    });
    expect(dto.limit).toBe(50);
    expect(dto.offset).toBe(10);
  });

  it('accepts every action the sync contract defines', () => {
    for (const action of [
      'added',
      'removed',
      'updated',
      'deactivated',
      'role_assigned',
      'role_removed',
    ]) {
      const dto = plainToInstance(SyncChangesQueryDto, { action });
      expect(validateSync(dto)).toEqual([]);
    }
  });

  it('rejects an unknown action, so a typo is a 400 instead of an empty page', () => {
    const dto = plainToInstance(SyncChangesQueryDto, { action: 'addded' });
    const errors = validateSync(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('action');
  });

  it('rejects a limit outside the endpoint bounds', () => {
    const zero = validateSync(
      plainToInstance(SyncChangesQueryDto, { limit: '0' }),
    );
    const tooBig = validateSync(
      plainToInstance(SyncChangesQueryDto, { limit: '101' }),
    );
    expect(zero[0]!.property).toBe('limit');
    expect(tooBig[0]!.property).toBe('limit');
  });
});
