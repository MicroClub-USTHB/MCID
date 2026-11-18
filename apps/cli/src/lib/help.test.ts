import { describe, expect, it, vi } from 'vitest';
import { pageRows } from './help.js';

describe('pageRows', () => {
  it.each(['0', '-1', '2.5', 'NaN', '9007199254740992'])(
    'rejects invalid limit %s, even with --all',
    (limit) => {
      expect(() => pageRows([1, 2], { limit, all: true })).toThrow('--limit');
    },
  );
  it('rejects page offsets that exceed the safe integer range', () => {
    expect(() => pageRows([1], { limit: '100', page: '9007199254740991' })).toThrow('--page');
  });
  it('returns a selected page and reports remaining rows to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(pageRows([1, 2, 3, 4, 5], { limit: '2', page: '2' })).toEqual([3, 4]);
      expect(write).toHaveBeenCalledWith(expect.stringContaining('--page 3'));
    } finally {
      write.mockRestore();
    }
  });
});
