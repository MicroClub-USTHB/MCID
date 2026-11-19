import { describe, expect, it } from 'vitest';
import { isAccessLevel, isAccessResource } from '@mcid/contracts';

describe('access command helpers', () => {
  it('validates access resources and levels', () => {
    expect(isAccessResource('projects')).toBe(true);
    expect(isAccessResource('members')).toBe(true);
    expect(isAccessResource('invalid_resource')).toBe(false);

    expect(isAccessLevel('read')).toBe(true);
    expect(isAccessLevel('write')).toBe(true);
    expect(isAccessLevel('manage')).toBe(true);
    expect(isAccessLevel('none')).toBe(true);
    expect(isAccessLevel('superuser')).toBe(false);
  });
});
