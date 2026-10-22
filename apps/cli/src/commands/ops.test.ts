import { describe, expect, it } from 'vitest';
import { formatSparkline } from '../lib/tui.js';

describe('ops and monitoring widgets', () => {
  it('correctly maps values to sparklines', () => {
    const values = [10, 20, 30, 40, 50];
    const spark = formatSparkline(values);
    expect(spark.length).toBe(5);
    expect(spark).toBe(' ▂▄▆█');
  });
});
