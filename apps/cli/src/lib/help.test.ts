import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { addListPaging, pageRows } from './help.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const rows = Array.from({ length: 35 }, (_, index) => ({
  id: index + 1,
}));

function silenceStderr() {
  return vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

describe('addListPaging', () => {
  it('registers all three pagination options', () => {
    const command = addListPaging(new Command('list'));
    const optionNames = command.options.map((option) => option.long);

    expect(optionNames).toContain('--limit');
    expect(optionNames).toContain('--page');
    expect(optionNames).toContain('--all');
  });
});

describe('pageRows', () => {
  it('uses 30 rows per page and starts at page 1 by default', () => {
    silenceStderr();

    const result = pageRows(rows, {});

    expect(result).toHaveLength(30);
    expect(result[0]?.id).toBe(1);
    expect(result[29]?.id).toBe(30);
  });

  it('uses the requested limit and page', () => {
    silenceStderr();

    const result = pageRows(rows, { limit: '5', page: '2' });

    expect(result.map((row) => row.id)).toEqual([6, 7, 8, 9, 10]);
  });

  it('returns every row when --all is enabled', () => {
    const result = pageRows(rows, { all: true });

    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it('warns when more rows are available', () => {
    const stderr = silenceStderr();

    pageRows(rows, { limit: '10', page: '1' });

    expect(stderr).toHaveBeenCalledWith('Showing 1-10 of 35; use --page 2 or --all for more.\n');
  });

  it('returns the remaining rows on the last page without warning', () => {
    const stderr = silenceStderr();

    const result = pageRows(rows, { limit: '10', page: '4' });

    expect(result.map((row) => row.id)).toEqual([31, 32, 33, 34, 35]);
    expect(stderr).not.toHaveBeenCalled();
  });

  it('returns an empty array when the requested page is out of range', () => {
    silenceStderr();

    const result = pageRows(rows, { limit: '10', page: '10' });

    expect(result).toEqual([]);
  });

  it('does not warn when all rows fit on one page', () => {
    const stderr = silenceStderr();

    const result = pageRows(rows.slice(0, 10), { limit: '10' });

    expect(result).toHaveLength(10);
    expect(stderr).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', 'abc'])('rejects invalid --limit value: %s', (limit) => {
    expect(() => pageRows(rows, { limit })).toThrow('--limit must be a positive whole number');
  });

  it.each(['0', '-1', '1.5', 'abc'])('rejects invalid --page value: %s', (page) => {
    expect(() => pageRows(rows, { page })).toThrow('--page must be a positive whole number');
  });
});
