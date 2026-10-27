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
import { registerServerCommand } from './commands/server.js';
import { registerSyncCommand } from './commands/sync.js';
import { registerMemberCommand } from './commands/member.js';
import { registerRoleCommand } from './commands/role.js';
import { registerAccessCommand } from './commands/access.js';
import { registerOpsCommand } from './commands/ops.js';
import { registerDevCommand } from './commands/dev.js';
import { addExamples } from './lib/help.js';

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
  .option('--no-color', 'Disable colored terminal output')
  .option('--debug', 'Print request timings, error stacks and retry hints to stderr');

// --debug is global and inherited by every subcommand; the API client already
// reads MCID_DEBUG, so the flag only has to set it once.
program.hook('preAction', (thisCommand) => {
  if (thisCommand.optsWithGlobals().debug) process.env.MCID_DEBUG = '1';
});

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
registerServerCommand(program);
registerSyncCommand(program);
registerMemberCommand(program);
registerRoleCommand(program);
registerAccessCommand(program);
registerOpsCommand(program);
registerDevCommand(program);

// Short, copyable examples on each group's --help (#228).
const GROUP_EXAMPLES: Record<string, string[]> = {
  project: [
    'mcid-cli project list --json',
    'mcid-cli project create --name "Portal" --server "Micro Club"',
    'mcid-cli project key rotate portal',
  ],
  server: [
    'mcid-cli server list',
    'mcid-cli server channels "Micro Club"',
    'mcid-cli server channel "Micro Club" general',
  ],
  sync: [
    'mcid-cli sync run --server "Micro Club" --wait',
    'mcid-cli sync logs --server "Micro Club" --limit 10',
  ],
  member: [
    'mcid-cli member list --server "Micro Club" --limit 50',
    'mcid-cli member permissions @alice',
  ],
  role: ['mcid-cli role list --server "Micro Club"', 'mcid-cli role permissions lead'],
  access: ['mcid-cli access explain @alice', 'mcid-cli access role set lead project=write'],
  webhook: ['mcid-cli webhook list', 'mcid-cli webhook send contact-form --example --print-curl'],
  ops: ['mcid-cli status', 'mcid-cli audit list --since 24h --action-type access'],
  dev: ['mcid-cli dev sso --project portal', 'mcid-cli dev check @alice project:read'],
  schema: [
    'mcid-cli schema validate form.json',
    'mcid-cli schema preview form.json --step contact',
  ],
};

for (const command of program.commands) {
  const examples = GROUP_EXAMPLES[command.name()];
  if (examples) addExamples(command, examples);
}

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
