import { describe, expect, it } from 'vitest';
import { formatSparkline } from './tui.js';

describe('tui widgets', () => {
  it('renders sparklines for numeric sequences', () => {
    expect(formatSparkline([])).toBe('');
    expect(formatSparkline([5, 5, 5])).toBe('▄▄▄');
    const line = formatSparkline([0, 5, 10]);
    expect(line.length).toBe(3);
    expect(line[0]).toBe(' ');
    expect(line[2]).toBe('█');
  });
});
