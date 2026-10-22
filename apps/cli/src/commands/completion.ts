import { Command } from 'commander';
import { CliError, ExitCode } from '../errors.js';

const BASH_COMPLETION = `
# mcid-cli completion for bash
_mcid_cli_completion() {
  local cur prev words cword
  _init_completion || return

  local commands="login logout whoami doctor completion open profile config schema webhook project server sync member role access status monitor audit stats settings dev"
  local subcommands_project="list ls get create update delete rm redirect-uri key access"
  local subcommands_server="list ls get add update enable disable delete rm channels channel"
  local subcommands_sync="run status logs changes"
  local subcommands_member="list ls get permissions export"
  local subcommands_role="list ls get permissions inheritance"
  local subcommands_access="catalog explain roles role member overrides"
  local subcommands_webhook="list ls get create update delete rm send submissions submission watch docs settings readable secret"
  local subcommands_dev="sso token check env"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    return 0
  fi

  case "\${words[1]}" in
    project)
      COMPREPLY=( $(compgen -W "$subcommands_project" -- "$cur") )
      ;;
    server)
      COMPREPLY=( $(compgen -W "$subcommands_server" -- "$cur") )
      ;;
    sync)
      COMPREPLY=( $(compgen -W "$subcommands_sync" -- "$cur") )
      ;;
    member)
      COMPREPLY=( $(compgen -W "$subcommands_member" -- "$cur") )
      ;;
    role)
      COMPREPLY=( $(compgen -W "$subcommands_role" -- "$cur") )
      ;;
    access)
      COMPREPLY=( $(compgen -W "$subcommands_access" -- "$cur") )
      ;;
    webhook)
      COMPREPLY=( $(compgen -W "$subcommands_webhook" -- "$cur") )
      ;;
    dev)
      COMPREPLY=( $(compgen -W "$subcommands_dev" -- "$cur") )
      ;;
  esac
}

complete -F _mcid_cli_completion mcid-cli
complete -F _mcid_cli_completion mcid
`;

const ZSH_COMPLETION = `
#compdef mcid-cli mcid

_mcid_cli() {
  local -a commands
  commands=(
    'login:Log into MCID via Discord OAuth2'
    'logout:Invalidate session and log out'
    'whoami:Show current user profile and session'
    'doctor:Diagnose local setup and connectivity'
    'completion:Generate shell completion script'
    'open:Open MCID admin panel in the browser'
    'project:Manage projects, keys, and permissions'
    'server:Manage Discord servers and channels'
    'sync:Run and monitor Discord sync'
    'member:Query members, roles, and permissions'
    'role:Inspect roles and inheritance'
    'access:Explain and manage admin access'
    'webhook:Manage and test inbound webhooks'
    'status:Check system health and sync overview'
    'monitor:Ops metrics and usage statistics'
    'audit:Query audit logs'
    'stats:Server and member growth stats'
    'settings:View and manage MCID settings'
    'dev:Developer testing tools for SSO and permissions'
  )

  _arguments '1: :->command' '*: :->args'

  case $state in
    command)
      _describe -t commands 'mcid command' commands
      ;;
  esac
}

compdef _mcid_cli mcid-cli mcid
`;

const FISH_COMPLETION = `
# mcid-cli completion for fish
complete -c mcid-cli -f
complete -c mcid -f

complete -c mcid-cli -n "__fish_use_subcommand" -a "login logout whoami doctor completion open project server sync member role access webhook status monitor audit stats settings dev"
complete -c mcid -n "__fish_use_subcommand" -a "login logout whoami doctor completion open project server sync member role access webhook status monitor audit stats settings dev"
`;

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion <shell>')
    .description('Generate shell completion script (bash, zsh, fish)')
    .action((shell: string) => {
      const s = shell.toLowerCase();
      if (s === 'bash') {
        process.stdout.write(BASH_COMPLETION.trim() + '\n');
      } else if (s === 'zsh') {
        process.stdout.write(ZSH_COMPLETION.trim() + '\n');
      } else if (s === 'fish') {
        process.stdout.write(FISH_COMPLETION.trim() + '\n');
      } else {
        throw new CliError(
          `Unsupported shell "${shell}". Supported shells: bash, zsh, fish`,
          ExitCode.Usage,
        );
      }
    });
}
