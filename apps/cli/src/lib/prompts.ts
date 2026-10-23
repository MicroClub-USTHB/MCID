import readline from 'node:readline';
import { CliError, ExitCode } from '../errors.js';

/**
 * Zero-dependency interactive prompts using Node's raw-mode readline.
 * Adapted from eequaled/GLMproxy (MIT license).
 */

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

let onKeypress: ((key: readline.Key) => void) | null = null;
let keypressStarted = false;

function handleKeypress(str: string, key: readline.Key): void {
  if (key && key.ctrl && key.name === 'c') {
    stopKeypress();
    process.stdout.write('\n');
    process.exit(130);
  }
  if (onKeypress && key) {
    onKeypress(key);
  }
}

function startKeypress(): void {
  if (keypressStarted) return;
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('keypress', handleKeypress);
  process.stdout.write(HIDE_CURSOR);
  keypressStarted = true;
}

function stopKeypress(): void {
  if (!keypressStarted) return;
  process.stdout.write(SHOW_CURSOR);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdin.removeListener('keypress', handleKeypress);
  onKeypress = null;
  keypressStarted = false;
}

function question(message: string): string {
  return `${GREEN}?${RESET} ${BOLD}${message}${RESET}`;
}

function confirmed(message: string, value: string): string {
  return `${GREEN}✔${RESET} ${message}: ${CYAN}${value}${RESET}`;
}

export interface SelectChoice<T = string> {
  name: string;
  value: T;
  hint?: string | undefined;
}

export interface PromptSelectOptions<T = string> {
  message: string;
  hint?: string | undefined;
  choices: SelectChoice<T>[];
  default?: T | undefined;
}

export async function promptSelect<T = string>(options: PromptSelectOptions<T>): Promise<T> {
  if (!process.stdin.isTTY) {
    throw new CliError(
      `Cannot prompt for "${options.message}" in a non-interactive terminal; pass the required flag explicitly`,
      ExitCode.Usage,
    );
  }

  const { message, hint, choices, default: def } = options;
  let index = Math.max(
    0,
    choices.findIndex((c) => c.value === def),
  );
  const hintLines = hint ? hint.split('\n').length : 0;
  const lines = choices.length + 1 + hintLines;

  const render = (clear = false) => {
    if (clear) {
      process.stdout.write(`\x1b[${lines}A\r\x1b[J`);
    }
    process.stdout.write(`${question(message)}${hint ? `\n${DIM}${hint}${RESET}` : ''}\n`);
    for (let i = 0; i < choices.length; i++) {
      const selected = i === index;
      const choice = choices[i];
      if (!choice) continue;
      const hintText = choice.hint ? ` ${DIM}(${choice.hint})${RESET}` : '';
      if (selected) {
        process.stdout.write(` ${CYAN}❯ ${choice.name}${RESET}${hintText}\n`);
      } else {
        process.stdout.write(`   ${choice.name}${hintText}\n`);
      }
    }
  };

  startKeypress();
  render();

  return new Promise<T>((resolve) => {
    onKeypress = (key: readline.Key) => {
      if (key.name === 'up') {
        index = (index - 1 + choices.length) % choices.length;
        render(true);
      } else if (key.name === 'down') {
        index = (index + 1) % choices.length;
        render(true);
      } else if (key.name === 'return') {
        const choice = choices[index];
        if (!choice) return;
        process.stdout.write(`\x1b[${lines}A\r\x1b[J${confirmed(message, choice.name)}\n`);
        stopKeypress();
        resolve(choice.value);
      }
    };
  });
}

export interface PromptInputOptions {
  message: string;
  default?: string | undefined;
  validate?: ((value: string) => boolean | string) | undefined;
}

export async function promptInput(options: PromptInputOptions): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new CliError(
      `Cannot prompt for "${options.message}" in a non-interactive terminal; pass the required flag explicitly`,
      ExitCode.Usage,
    );
  }

  const { message, default: def = '', validate } = options;
  let buf = '';
  let errorMsg = '';

  const render = () => {
    process.stdout.write(
      `\r\x1b[2K${question(message)}${def ? ` ${DIM}(${def})${RESET}` : ''} ${buf}`,
    );
    if (errorMsg) {
      process.stdout.write(
        `\n\x1b[2K  ${RED}✗ ${errorMsg}${RESET}\x1b[1A\r\x1b[${message.length + (def ? def.length + 3 : 0) + buf.length + 4}C`,
      );
    }
  };

  startKeypress();
  render();

  return new Promise<string>((resolve) => {
    onKeypress = (key: readline.Key) => {
      if (key.name === 'return') {
        const val = buf.trim() || def;
        if (validate) {
          const res = validate(val);
          if (res !== true) {
            errorMsg = typeof res === 'string' ? res : 'Invalid input';
            render();
            return;
          }
        }
        process.stdout.write(`\r\x1b[2K${confirmed(message, val)}\n`);
        stopKeypress();
        resolve(val);
      } else if (key.name === 'backspace') {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          errorMsg = '';
          render();
        }
      } else if (
        key.sequence &&
        !key.ctrl &&
        !key.meta &&
        key.sequence.length === 1 &&
        key.sequence.charCodeAt(0) >= 32
      ) {
        buf += key.sequence;
        errorMsg = '';
        render();
      }
    };
  });
}

export interface PromptNumberOptions {
  message: string;
  default?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
}

export async function promptNumber(options: PromptNumberOptions): Promise<number> {
  const { message, default: def, min = 1, max = 65535 } = options;
  for (;;) {
    const raw = await promptInput({
      message,
      ...(def !== undefined ? { default: String(def) } : {}),
    });
    const n = Number(raw);
    if (Number.isInteger(n) && n >= min && n <= max) {
      return n;
    }
    process.stdout.write(`  ${RED}✗ must be a number between ${min} and ${max}${RESET}\n`);
  }
}

export interface PromptConfirmOptions {
  message: string;
  default?: boolean | undefined;
}

export async function promptConfirm(options: PromptConfirmOptions): Promise<boolean> {
  const { message, default: def = false } = options;
  const hint = def ? 'Y/n' : 'y/N';
  const raw = await promptInput({
    message: `${message} (${hint})`,
  });
  if (!raw) return def;
  const lower = raw.trim().toLowerCase();
  return lower === 'y' || lower === 'yes';
}
