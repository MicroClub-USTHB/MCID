#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { ExitCode } from './errors.js';
import { launchInteractiveLauncher, setColorEnabled } from './lib/tui.js';
import { registerLoginCommand } from './commands/login.js';
import { registerLogoutCommand } from './commands/logout.js';
import { registerWhoamiCommand } from './commands/whoami.js';
import { registerProfileCommand } from './commands/profile.js';
import { registerSchemaCommand } from './commands/schema.js';
import { registerWebhookCommand } from './commands/webhook.js';
import { registerConfigCommand } from './commands/config.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerCompletionCommand } from './commands/completion.js';
import { registerOpenCommand } from './commands/open.js';
import { registerProjectCommand } from './commands/project.js';

// When stdout is closed early (e.g. `mcid-cli webhook list | head`), stop quietly
// instead of crashing with an unhandled EPIPE stack trace.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

// Check for --no-color flag
if (process.argv.includes('--no-color')) {
  setColorEnabled(false);
}

// package.json sits one level up from both src/ (tsx) and dist/ (the published bundle).
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

// Before the subcommands are added, so they inherit it: usage errors get their
// own exit code instead of sharing 1 with a failed schema pre-check.
program.exitOverride((err) => {
  const done = err.code === 'commander.helpDisplayed' || err.code === 'commander.version';
  process.exit(done || err.exitCode === 0 ? ExitCode.Ok : ExitCode.Usage);
});

program
  .name('mcid-cli')
  .description('MCID command-line client: manage projects, servers, members, sync, and webhooks')
  .version(version)
  .option('--no-color', 'Disable colored terminal output');

registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);
registerDoctorCommand(program);
registerCompletionCommand(program);
registerOpenCommand(program);
registerProfileCommand(program);
registerConfigCommand(program);
registerSchemaCommand(program);
registerWebhookCommand(program);
registerProjectCommand(program);

async function main() {
  if (process.argv.length <= 2) {
    if (process.stdin.isTTY && !process.env.CI) {
      try {
        const action = await launchInteractiveLauncher();
        if (action === 'exit') {
          process.exit(0);
        }
        process.argv.push(...action.split(' '));
      } catch {
        process.exit(0);
      }
    }
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(ExitCode.Unexpected);
});
