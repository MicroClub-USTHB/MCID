import type { Command } from 'commander';
import { CliError, ExitCode } from '../errors.js';

/** Appends a short, copyable example block to a command group's --help. */
export function addExamples(command: Command, examples: readonly string[]): void {
  if (examples.length === 0) return;
  command.addHelpText(
    'after',
    `\nExamples:\n${examples.map((example) => `  ${example}`).join('\n')}\n`,
  );
}

export interface ListPaging {
  limit?: string | undefined;
  page?: string | undefined;
  all?: boolean | undefined;
}

/** Adds the shared `--limit`, `--page` and `--all` options to a list command (#228). */
export function addListPaging(command: Command): Command {
  return command
    .option('--limit <n>', 'Rows per page (default 30)')
    .option('--page <n>', 'Page number (default 1)')
    .option('--all', 'Show every row, not just one page');
}

function positiveInt(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliError(`${flag} must be a positive whole number`, ExitCode.Usage);
  }
  return parsed;
}

/**
 * Pages a list the API returns in full. Says on stderr when rows were left out,
 * so a truncated table is never mistaken for the whole list.
 */
export function pageRows<T>(rows: readonly T[], paging: ListPaging): T[] {
  if (paging.all) return [...rows];
  const limit = positiveInt(paging.limit, 30, '--limit');
  const page = positiveInt(paging.page, 1, '--page');
  const start = (page - 1) * limit;
  const slice = rows.slice(start, start + limit);
  if (rows.length > start + limit) {
    process.stderr.write(
      `Showing ${start + 1}-${start + slice.length} of ${rows.length}; use --page ${page + 1} or --all for more.\n`,
    );
  }
  return slice;
}
