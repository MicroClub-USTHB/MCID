import type { Command } from 'commander';

/** Appends a short, copyable example block to a command group's --help. */
export function addExamples(command: Command, examples: readonly string[]): void {
  if (examples.length === 0) return;
  command.addHelpText(
    'after',
    `\nExamples:\n${examples.map((example) => `  ${example}`).join('\n')}\n`,
  );
}
