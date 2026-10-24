/* eslint-disable no-control-regex */
import { access, writeFile } from 'node:fs/promises';
import { CliError, ExitCode } from '../errors.js';
import { colors } from './tui.js';

/**
 * Writes an exported report owner-only (0600) and refuses to clobber an
 * existing file unless --force was passed.
 */
export async function writeExportFile(path: string, content: string, force = false): Promise<void> {
  if (!force) {
    try {
      await access(path);
      throw new CliError(
        `"${path}" already exists; pass --force to overwrite it`,
        ExitCode.Rejected,
      );
    } catch (error) {
      if (error instanceof CliError) throw error;
      // ENOENT: the file does not exist yet, so writing is safe.
    }
  }
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 });
}

export type OutputFormat = 'table' | 'json' | 'csv' | 'quiet';

export interface Column<T = Record<string, unknown>> {
  header: string;
  key?: keyof T | string | undefined;
  width?: number | undefined;
  align?: 'left' | 'right' | 'center' | undefined;
  format?: ((value: unknown, row: T) => string) | undefined;
}

export function formatAge(dateString: string | null | undefined): string {
  if (!dateString) return 'never';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 0) return 'in the future';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y ago`;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  return date.toISOString().slice(0, 10);
}

export function printSuccess(message: string, hint?: string): void {
  process.stdout.write(`${colors.green('✓')} ${message}\n`);
  if (hint) {
    process.stdout.write(`  ${colors.dim(`hint: ${hint}`)}\n`);
  }
}

export function printError(message: string, hint?: string): void {
  process.stderr.write(`${colors.red('✗')} ${message}\n`);
  if (hint) {
    process.stderr.write(`  ${colors.dim(`hint: ${hint}`)}\n`);
  }
}

export function printTable<T extends Record<string, unknown>>(options: {
  columns: Column<T>[];
  data: T[];
}): void {
  const { columns, data } = options;
  if (data.length === 0) {
    process.stdout.write(colors.dim('No records found.\n'));
    return;
  }

  // Calculate widths
  const widths = columns.map((col) => {
    let max = col.header.length;
    for (const row of data) {
      const rawVal = col.key ? row[col.key as keyof T] : undefined;
      const formatted = col.format ? col.format(rawVal, row) : String(rawVal ?? '');
      // Strip ANSI codes for length measurement
      const plain = formatted.replace(/\x1b\[[0-9;]*m/g, '');
      if (plain.length > max) max = plain.length;
    }
    return Math.max(col.width ?? 0, max);
  });

  // Header row
  const headerLine = columns
    .map((col, i) => col.header.padEnd(widths[i] ?? col.header.length))
    .join('  ');
  process.stdout.write(`${colors.bold(headerLine)}\n`);

  // Underline
  const dividerLine = widths.map((w) => '─'.repeat(w)).join('  ');
  process.stdout.write(`${colors.dim(dividerLine)}\n`);

  // Data rows
  for (const row of data) {
    const rowLine = columns
      .map((col, i) => {
        const rawVal = col.key ? row[col.key as keyof T] : undefined;
        const formatted = col.format ? col.format(rawVal, row) : String(rawVal ?? '');
        const plain = formatted.replace(/\x1b\[[0-9;]*m/g, '');
        const width = widths[i] ?? plain.length;
        const padSize = Math.max(0, width - plain.length);

        if (col.align === 'right') {
          return ' '.repeat(padSize) + formatted;
        } else if (col.align === 'center') {
          const leftPad = Math.floor(padSize / 2);
          const rightPad = padSize - leftPad;
          return ' '.repeat(leftPad) + formatted + ' '.repeat(rightPad);
        }
        return formatted + ' '.repeat(padSize);
      })
      .join('  ');
    process.stdout.write(`${rowLine}\n`);
  }
}

export function printKeyValue(data: Record<string, unknown>): void {
  const entries = Object.entries(data);
  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

  for (const [key, val] of entries) {
    let formatted: string;
    if (val === null || val === undefined) {
      formatted = colors.dim('-');
    } else if (typeof val === 'object') {
      formatted = JSON.stringify(val);
    } else {
      formatted = String(val);
    }
    process.stdout.write(`${colors.dim(key.padEnd(maxKeyLen))}  ${formatted}\n`);
  }
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';
  const firstRow = rows[0];
  const cols = columns ?? (firstRow ? Object.keys(firstRow) : []);

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = cols.map(escapeCell).join(',');
  const lines = rows.map((row) => cols.map((col) => escapeCell(row[col])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

export function printQuiet(ids: string[]): void {
  for (const id of ids) {
    process.stdout.write(`${id}\n`);
  }
}

export function printJson(data: unknown, reveal = false): void {
  if (!reveal && data && typeof data === 'object') {
    const clone = JSON.parse(JSON.stringify(data));
    maskSecrets(clone);
    process.stdout.write(JSON.stringify(clone, null, 2) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

function maskSecrets(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) maskSecrets(item);
    return;
  }
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (
      k.toLowerCase().includes('secret') ||
      k.toLowerCase().includes('token') ||
      k.toLowerCase() === 'key' ||
      k.toLowerCase() === 'apikey' ||
      k.toLowerCase() === 'api_key'
    ) {
      if (typeof v === 'string' && v.length > 8) {
        rec[k] = `${v.slice(0, 4)}...[REDACTED]`;
      }
    } else if (typeof v === 'object' && v !== null) {
      maskSecrets(v);
    }
  }
}
