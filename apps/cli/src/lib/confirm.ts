import { CliError, ExitCode } from '../errors.js';
import { promptInput } from './prompts.js';
import { colors } from './tui.js';

export interface ConfirmDestructiveOptions {
  resourceType: string;
  resourceName: string;
  yesFlag?: boolean | undefined;
}

export async function confirmDestructive(options: ConfirmDestructiveOptions): Promise<void> {
  const { resourceType, resourceName, yesFlag } = options;

  if (yesFlag) return;

  if (!process.stdin.isTTY) {
    throw new CliError(
      `Destructive command requires confirmation on non-interactive terminal\n  hint: pass --yes to confirm`,
      ExitCode.Usage,
    );
  }

  process.stdout.write(
    `${colors.yellow('!')} This action cannot be undone. This will permanently delete ${resourceType} "${colors.bold(resourceName)}".\n`,
  );

  const answer = await promptInput({
    message: `Type "${resourceName}" to confirm`,
  });

  if (answer !== resourceName) {
    throw new CliError('Confirmation text did not match; action aborted', ExitCode.Ok);
  }
}
