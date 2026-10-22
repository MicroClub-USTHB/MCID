import { promptSelect } from './prompts.js';

/**
 * Terminal UI styling and widgets.
 * Honors NO_COLOR and --no-color flags.
 */

const noColorEnv = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
let colorEnabled = !noColorEnv && (process.stdout.isTTY ?? false);

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

export const colors = {
  reset: (text: string) => (colorEnabled ? `\x1b[0m${text}` : text),
  bold: (text: string) => (colorEnabled ? `\x1b[1m${text}\x1b[0m` : text),
  dim: (text: string) => (colorEnabled ? `\x1b[2m${text}\x1b[0m` : text),
  italic: (text: string) => (colorEnabled ? `\x1b[3m${text}\x1b[0m` : text),
  underline: (text: string) => (colorEnabled ? `\x1b[4m${text}\x1b[0m` : text),
  red: (text: string) => (colorEnabled ? `\x1b[31m${text}\x1b[0m` : text),
  green: (text: string) => (colorEnabled ? `\x1b[32m${text}\x1b[0m` : text),
  yellow: (text: string) => (colorEnabled ? `\x1b[33m${text}\x1b[0m` : text),
  blue: (text: string) => (colorEnabled ? `\x1b[34m${text}\x1b[0m` : text),
  magenta: (text: string) => (colorEnabled ? `\x1b[35m${text}\x1b[0m` : text),
  cyan: (text: string) => (colorEnabled ? `\x1b[36m${text}\x1b[0m` : text),
  gray: (text: string) => (colorEnabled ? `\x1b[90m${text}\x1b[0m` : text),
};

const SPARK_TICKS = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Creates an ASCII sparkline representation of numbers.
 */
export function formatSparkline(values: number[]): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) {
    return '▄'.repeat(values.length);
  }

  return values
    .map((val) => {
      const idx = Math.min(
        SPARK_TICKS.length - 1,
        Math.floor(((val - min) / range) * (SPARK_TICKS.length - 1)),
      );
      return SPARK_TICKS[idx] ?? '▄';
    })
    .join('');
}

export function printBanner(): void {
  const banner = `
  __  __  ____ ___ ____  
 |  \\/  |/ ___|_ _|  _ \\ 
 | |\\/| | |    | || | | |
 | |  | | |___ | || |_| |
 |_|  |_|\\____|___|____/  Command Line Client
`;
  process.stdout.write(colors.cyan(banner) + '\n');
}

/**
 * Interactive menu shown when mcid-cli is invoked without arguments on a TTY.
 */
export async function launchInteractiveLauncher(): Promise<string> {
  printBanner();
  process.stdout.write(
    ` ${colors.dim('Micro Club USTHB Identity & Admin Terminal')}\n\n`,
  );

  const choices = [
    { name: 'Projects       — Manage apps, API keys, redirect URIs, and access', value: 'project list' },
    { name: 'Servers & Sync — Inspect Discord servers, channels, and run sync', value: 'server list' },
    { name: 'Members        — Search members, inspect roles and permissions', value: 'member list' },
    { name: 'Roles          — Inspect Discord roles and role inheritance', value: 'role list' },
    { name: 'Webhooks       — Manage and test Inbound Webhook forms', value: 'webhook list' },
    { name: 'Admin Access   — Explain permissions, role catalog and grants', value: 'access catalog' },
    { name: 'System Status  — Service health and server sync status overview', value: 'status' },
    { name: 'Doctor         — Check local environment and connectivity', value: 'doctor' },
    { name: 'Whoami         — Current active profile and authenticated member', value: 'whoami' },
    { name: 'Open Web Panel — Open MCID web dashboard in your browser', value: 'open' },
    { name: 'Exit', value: 'exit' },
  ];

  const chosen = await promptSelect({
    message: 'Select a task to run',
    choices,
  });

  return chosen;
}
