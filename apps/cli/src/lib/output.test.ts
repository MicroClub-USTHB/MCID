import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatAge, formatDate, toCsv, writeExportFile } from './output.js';

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

describe('writeExportFile', () => {
  it('refuses to overwrite an existing report without --force', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcid-export-'));
    try {
      const target = join(dir, 'report.csv');
      await writeFile(target, 'old', 'utf8');

      await expect(writeExportFile(target, 'new')).rejects.toMatchObject({
        message: expect.stringContaining('--force'),
      });
      expect(await readFile(target, 'utf8')).toBe('old');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overwrites an existing report when --force is passed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcid-export-'));
    try {
      const target = join(dir, 'report.csv');
      await writeFile(target, 'old', 'utf8');

      await writeExportFile(target, 'new', true);
      expect(await readFile(target, 'utf8')).toBe('new');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
