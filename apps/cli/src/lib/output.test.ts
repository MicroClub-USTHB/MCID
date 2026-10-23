import { describe, expect, it } from 'vitest';
import { formatAge, formatDate, toCsv } from './output.js';

describe('output formatters', () => {
  it('formats relative ages cleanly', () => {
    expect(formatAge(null)).toBe('never');
    expect(formatAge(undefined)).toBe('never');

    const now = Date.now();
    expect(formatAge(new Date(now - 10_000).toISOString())).toBe('10s ago');
    expect(formatAge(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(formatAge(new Date(now - 3 * 3600_000).toISOString())).toBe('3h ago');
    expect(formatAge(new Date(now - 2 * 86400_000).toISOString())).toBe('2d ago');
  });

  it('formats dates in ISO yyyy-mm-dd format', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('2026-10-23T12:00:00Z')).toBe('2026-10-23');
  });

  it('converts objects array to CSV format properly', () => {
    const data = [
      { id: '1', name: 'Alpha', note: 'simple' },
      { id: '2', name: 'Beta, with comma', note: 'quoted "quote"' },
    ];
    const csv = toCsv(data);
    expect(csv).toContain('id,name,note');
    expect(csv).toContain('1,Alpha,simple');
    expect(csv).toContain('2,"Beta, with comma","quoted ""quote"""');
  });
});
