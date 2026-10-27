import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../test-support/cli-harness.js';
import { COMMAND_EXAMPLES, addCommandExamples, leafCommands } from './examples.js';

const GLOBAL_FLAGS = new Set(['--no-color', '--debug', '--help', '-h']);

/** Walks `mcid-cli a b c ...` down the command tree and returns the command it lands on. */
function commandFor(program: Command, words: string[]): Command | undefined {
  let current = program;
  for (const word of words) {
    const next = current.commands.find((c) => c.name() === word || c.aliases().includes(word));
    if (!next) break;
    current = next;
  }
  return current === program ? undefined : current;
}

function flagsOf(command: Command): Set<string> {
  const flags = new Set(GLOBAL_FLAGS);
  for (const option of command.options) {
    if (option.long) flags.add(option.long);
    if (option.short) flags.add(option.short);
  }
  return flags;
}

describe('command examples', () => {
  const program = buildProgram();
  addCommandExamples(program);
  const leaves = leafCommands(program);

  it('gives every visible command at least two examples', () => {
    const missing = leaves.filter(({ path }) => (COMMAND_EXAMPLES[path]?.length ?? 0) < 2);
    expect(missing.map((l) => l.path)).toEqual([]);
  });

  it('has no example for a command that does not exist', () => {
    const known = new Set(leaves.map((l) => l.path));
    expect(Object.keys(COMMAND_EXAMPLES).filter((path) => !known.has(path))).toEqual([]);
  });

  it('only uses flags the command really has, and starts at the right command', () => {
    const problems: string[] = [];
    for (const { path, command } of leaves) {
      for (const example of COMMAND_EXAMPLES[path] ?? []) {
        const words = example
          .replace(/"[^"]*"/g, '"x"')
          .split(/\s+/)
          .slice(1);
        const landed = commandFor(program, words);
        if (landed !== command) problems.push(`${example}: lands on ${landed?.name()}`);
        const flags = flagsOf(command);
        for (const word of words) {
          if (!word.startsWith('-') || word.startsWith('$')) continue;
          const flag = word.split('=')[0] as string;
          if (!flags.has(flag)) problems.push(`${example}: unknown ${flag}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('shows the examples in --help', () => {
    const project = commandFor(program, ['project', 'create']);
    expect(project?.helpInformation()).toBeDefined();
    let output = '';
    project?.configureOutput({ writeOut: (text) => (output += text) });
    project?.outputHelp();
    expect(output).toContain('Examples:');
    expect(output).toContain('--server "Micro Club"');
  });
});
