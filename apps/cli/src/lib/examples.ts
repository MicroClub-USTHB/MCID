import type { Command } from 'commander';
import { addExamples } from './help.js';

/** Two copyable examples per command, keyed by its path (#228). */
export const COMMAND_EXAMPLES: Record<string, readonly string[]> = {
  login: ['mcid-cli login --profile prod', 'mcid-cli login --profile local'],
  logout: ['mcid-cli logout', 'mcid-cli logout --profile prod'],
  whoami: ['mcid-cli whoami', 'mcid-cli whoami --json'],
  doctor: ['mcid-cli doctor', 'mcid-cli doctor --profile prod'],
  completion: ['mcid-cli completion zsh > ~/.zfunc/_mcid-cli', 'mcid-cli completion bash'],
  open: ['mcid-cli open project portal', 'mcid-cli open docs'],
  'profile list': ['mcid-cli profile list', 'mcid-cli profile list | grep prod'],
  'profile add': [
    'mcid-cli profile add prod --base-url https://mcid.microclub.info',
    'mcid-cli profile add local --base-url http://localhost:3000',
  ],
  'profile use': ['mcid-cli profile use prod', 'mcid-cli profile use local'],
  'profile remove': ['mcid-cli profile remove local', 'mcid-cli profile remove old-staging'],
  'config path': ['mcid-cli config path', 'mcid-cli config path | xargs cat'],
  'config show': ['mcid-cli config show', 'mcid-cli config show --profile prod'],
  'schema init': [
    'mcid-cli schema init form.json',
    'mcid-cli schema init contact.json --template recruitment',
  ],
  'schema validate': [
    'mcid-cli schema validate form.json',
    'mcid-cli schema validate contact.json',
  ],
  'schema preview': [
    'mcid-cli schema preview form.json',
    'mcid-cli schema preview form.json --profile prod',
  ],
  'webhook create': [
    'mcid-cli webhook create form.json --name "Contact form" --project portal --profile prod',
    'mcid-cli webhook create form.json --name "Signup" --project portal --accept-origin https://portal.example.com --profile prod',
  ],
  'webhook update': [
    'mcid-cli webhook update contact-form --name "Contact" --profile prod',
    'mcid-cli webhook update contact-form --schema form.json --profile prod',
  ],
  'webhook list': ['mcid-cli webhook list', 'mcid-cli webhook list --project portal --json'],
  'webhook get': [
    'mcid-cli webhook get contact-form',
    'mcid-cli webhook get contact-form --schema-only',
  ],
  'webhook delete': [
    'mcid-cli webhook delete contact-form --profile prod',
    'mcid-cli webhook delete contact-form --yes --profile prod',
  ],
  'webhook roles set': [
    'mcid-cli webhook roles set contact-form --roles 123456789012345678 --profile prod',
    'mcid-cli webhook roles set contact-form --roles 111,222 --profile prod',
  ],
  'webhook rotate-secret': [
    'mcid-cli webhook rotate-secret contact-form --profile prod',
    'mcid-cli webhook rotate-secret contact-form --yes --reveal --profile prod',
  ],
  'webhook secret get': [
    'mcid-cli webhook secret get contact-form',
    'mcid-cli webhook secret get contact-form --reveal',
  ],
  'webhook send': [
    'mcid-cli webhook send contact-form --example',
    'mcid-cli webhook send contact-form --data payload.json --print-curl',
  ],
  'webhook submissions list': [
    'mcid-cli webhook submissions list contact-form --since 24h',
    'mcid-cli webhook submissions list contact-form --columns name,email -o csv',
  ],
  'webhook submissions export': [
    'mcid-cli webhook submissions export contact-form --file subs.csv',
    'mcid-cli webhook submissions export contact-form -o json --file subs.json --force',
  ],
  'webhook submission': [
    'mcid-cli webhook submission contact-form 9f1c2d3e',
    'mcid-cli webhook submission contact-form 9f1c2d3e --json',
  ],
  'webhook watch': [
    'mcid-cli webhook watch contact-form',
    'mcid-cli webhook watch contact-form --json | jq .id',
  ],
  'webhook docs': [
    'mcid-cli webhook docs contact-form',
    'mcid-cli webhook docs contact-form --file contact-form.md',
  ],
  'webhook settings get': ['mcid-cli webhook settings get', 'mcid-cli webhook settings get --json'],
  'webhook settings set': [
    'mcid-cli webhook settings set --reader-role 123456789012345678',
    'mcid-cli webhook settings set --reader-role 111 222',
  ],
  'webhook readable': ['mcid-cli webhook readable', 'mcid-cli webhook readable --json'],
  'project list': ['mcid-cli project list', 'mcid-cli project list -q'],
  'project get': ['mcid-cli project get portal', 'mcid-cli project get portal --json'],
  'project create': [
    'mcid-cli project create --name "Portal" --redirect-uri http://localhost:3000/callback --server "Micro Club"',
    'mcid-cli project create --name "Portal" --env-out .env',
  ],
  'project update': [
    'mcid-cli project update portal --name "Member Portal"',
    'mcid-cli project update portal --description "Members area"',
  ],
  'project delete': ['mcid-cli project delete portal', 'mcid-cli project delete portal --yes'],
  'project redirect-uri list': [
    'mcid-cli project redirect-uri list portal',
    'mcid-cli project redirect-uri list portal --json',
  ],
  'project redirect-uri add': [
    'mcid-cli project redirect-uri add portal http://localhost:3000/callback',
    'mcid-cli project redirect-uri add portal https://portal.example.com/callback',
  ],
  'project redirect-uri remove': [
    'mcid-cli project redirect-uri remove portal http://localhost:3000/callback',
    'mcid-cli project redirect-uri remove portal https://old.example.com/callback',
  ],
  'project key show': [
    'mcid-cli project key show portal',
    'mcid-cli project key show portal --json',
  ],
  'project key rotate': [
    'mcid-cli project key rotate portal',
    'mcid-cli project key rotate portal --yes',
  ],
  'project key revoke': [
    'mcid-cli project key revoke portal',
    'mcid-cli project key revoke portal --yes',
  ],
  'project key restore': [
    'mcid-cli project key restore portal',
    'mcid-cli project key restore portal --yes',
  ],
  'project access list': [
    'mcid-cli project access list portal',
    'mcid-cli project access list portal --json',
  ],
  'project access grant': [
    'mcid-cli project access grant portal "Micro Club" --scope read_members check_permissions',
    'mcid-cli project access grant portal "Micro Club" --scope read_members --operation READ',
  ],
  'project access revoke': [
    'mcid-cli project access revoke portal "Micro Club"',
    'mcid-cli project access revoke portal "Micro Club" --yes',
  ],
  'project access matrix': [
    'mcid-cli project access matrix',
    'mcid-cli project access matrix --json',
  ],
  'project access log': [
    'mcid-cli project access log',
    'mcid-cli project access log --project portal --json',
  ],
  'server list': ['mcid-cli server list', 'mcid-cli server list -o csv'],
  'server get': ['mcid-cli server get', 'mcid-cli server get "Micro Club" --json'],
  'server add': [
    'mcid-cli server add 123456789012345678',
    'mcid-cli server add 123456789012345678 --name "Hackathon 2026"',
  ],
  'server update': [
    'mcid-cli server update "Hackathon 2026" --name "Hackathon"',
    'mcid-cli server update "Micro Club" --sync-frequency-hours 6',
  ],
  'server enable': [
    'mcid-cli server enable "Hackathon 2026"',
    'mcid-cli server enable 123456789012345678',
  ],
  'server disable': [
    'mcid-cli server disable "Hackathon 2026"',
    'mcid-cli server disable 123456789012345678',
  ],
  'server delete': [
    'mcid-cli server delete "Hackathon 2026"',
    'mcid-cli server delete "Hackathon 2026" --yes',
  ],
  'server channels': ['mcid-cli server channels', 'mcid-cli server channels "Micro Club" --json'],
  'server channel': [
    'mcid-cli server channel "Micro Club" general',
    'mcid-cli server channel "Micro Club" general --messages 20',
  ],
  'sync run': [
    'mcid-cli sync run --wait',
    'mcid-cli sync run --server "Micro Club" --wait --timeout 300',
  ],
  'sync status': ['mcid-cli sync status', 'mcid-cli sync status --all'],
  'sync logs': ['mcid-cli sync logs --limit 10', 'mcid-cli sync logs --server "Micro Club" --all'],
  'sync changes': [
    'mcid-cli sync changes 4242',
    'mcid-cli sync changes 4242 --type removed -o csv',
  ],
  'member list': [
    'mcid-cli member list --search alice',
    'mcid-cli member list --role "Dev Lead" --joined-after 2026-09-01 --all',
  ],
  'member get': ['mcid-cli member get @alice', 'mcid-cli member get 333333333333333333 --json'],
  'member permissions': [
    'mcid-cli member permissions @alice --project portal',
    'mcid-cli member permissions @alice --server "Micro Club" --api-key $MCID_API_KEY',
  ],
  'member export': [
    'mcid-cli member export --file members.csv',
    'mcid-cli member export --role "Dev Lead" --search ali -o json --file leads.json',
  ],
  'role list': ['mcid-cli role list', 'mcid-cli role list --server "Micro Club" -q'],
  'role get': ['mcid-cli role get "Dev Lead"', 'mcid-cli role get "Dev Lead" --json'],
  'role permissions list': [
    'mcid-cli role permissions list "Dev Lead"',
    'mcid-cli role permissions ls "Dev Lead" --server "Micro Club"',
  ],
  'role permissions add': [
    'mcid-cli role permissions add "Dev Lead" projects.read --dry-run',
    'mcid-cli role permissions add "Dev Lead" projects.read --yes',
  ],
  'role permissions remove': [
    'mcid-cli role permissions remove "Dev Lead" projects.read --dry-run',
    'mcid-cli role permissions remove "Dev Lead" projects.read --yes',
  ],
  'role inheritance list': [
    'mcid-cli role inheritance list',
    'mcid-cli role inheritance list --server "Micro Club"',
  ],
  'role inheritance set': [
    'mcid-cli role inheritance set "Dev Lead" --target-scope all',
    'mcid-cli role inheritance set "Dev Lead" --target-scope selected --target-servers 123456789012345678',
  ],
  'access catalog': ['mcid-cli access catalog', 'mcid-cli access catalog --json'],
  'access explain': ['mcid-cli access explain @alice', 'mcid-cli access explain @alice --json'],
  'access roles': ['mcid-cli access roles', 'mcid-cli access roles --json'],
  'access role set': [
    'mcid-cli access role set "Dev Lead" projects=write',
    'mcid-cli access role set "Dev Lead" projects=write members=read --replace --yes',
  ],
  'access member get': [
    'mcid-cli access member get @alice',
    'mcid-cli access member get @alice --json',
  ],
  'access member set': [
    'mcid-cli access member set @alice settings=read',
    'mcid-cli access member set @alice settings=read --replace --yes',
  ],
  'access member unset': [
    'mcid-cli access member unset @alice settings',
    'mcid-cli access member unset @alice settings --yes',
  ],
  'access overrides': ['mcid-cli access overrides', 'mcid-cli access overrides --json'],
  status: ['mcid-cli status', 'mcid-cli status --json'],
  'monitor usage': ['mcid-cli monitor usage', 'mcid-cli monitor usage --period 30d --json'],
  'monitor auth-failures': [
    'mcid-cli monitor auth-failures --since 24h',
    'mcid-cli monitor auth-failures --since 2026-10-01 --json',
  ],
  'audit list': ['mcid-cli audit list --since 24h', 'mcid-cli audit list --action access --follow'],
  'audit export': [
    'mcid-cli audit export --file audit.csv',
    'mcid-cli audit export --action access --since 7d --file access-audit.csv --force',
  ],
  'stats members': [
    'mcid-cli stats members',
    'mcid-cli stats members --server "Micro Club" --json',
  ],
  'stats growth': [
    'mcid-cli stats growth',
    'mcid-cli stats growth --period 90d --server "Micro Club"',
  ],
  'stats roles': ['mcid-cli stats roles', 'mcid-cli stats roles --server "Micro Club" --json'],
  'stats servers': ['mcid-cli stats servers', 'mcid-cli stats servers --json'],
  'stats overlap': ['mcid-cli stats overlap', 'mcid-cli stats overlap --json'],
  'stats export': [
    'mcid-cli stats export --type growth --file growth.csv',
    'mcid-cli stats export --type roles --server "Micro Club" -o json --file roles.json',
  ],
  'settings get': ['mcid-cli settings get', 'mcid-cli settings get --json'],
  'settings set': [
    'mcid-cli settings set cache.statsTtlMs=60000',
    'mcid-cli settings set cache.statsTtlMs=60000 --yes',
  ],
  'settings reset': ['mcid-cli settings reset', 'mcid-cli settings reset --yes'],
  'discord-webhook list': [
    'mcid-cli discord-webhook list --project portal',
    'mcid-cli discord-webhook list --project portal -q',
  ],
  'discord-webhook get': [
    'mcid-cli discord-webhook get 1a2b3c',
    'mcid-cli discord-webhook get 1a2b3c --json',
  ],
  'discord-webhook delete': [
    'mcid-cli discord-webhook delete 1a2b3c',
    'mcid-cli discord-webhook delete 1a2b3c --yes',
  ],
  'dev sso': ['mcid-cli dev sso --project portal', 'mcid-cli dev sso --project portal --silent'],
  'dev token validate': [
    'mcid-cli dev token validate $TOKEN',
    'mcid-cli dev token validate $TOKEN --api-key $MCID_API_KEY',
  ],
  'dev token refresh': [
    'mcid-cli dev token refresh $REFRESH_TOKEN --token $TOKEN',
    'mcid-cli dev token refresh $REFRESH_TOKEN --token $TOKEN --json',
  ],
  'dev check': [
    'mcid-cli dev check @alice projects.read',
    'mcid-cli dev check @alice projects.read members.read --server "Micro Club"',
  ],
  'dev env': ['mcid-cli dev env --project portal', 'mcid-cli dev env --project portal --file .env'],
};

/** Visible commands with no subcommands, with their space-joined path from the root. */
export function leafCommands(program: Command): { path: string; command: Command }[] {
  const leaves: { path: string; command: Command }[] = [];
  const walk = (command: Command, prefix: string[]) => {
    for (const sub of command.commands) {
      if ((sub as Command & { _hidden?: boolean })._hidden) continue;
      const path = [...prefix, sub.name()];
      if (sub.commands.length === 0) leaves.push({ path: path.join(' '), command: sub });
      else walk(sub, path);
    }
  };
  walk(program, []);
  return leaves;
}

/** Adds the per-command examples to every command that has an entry. */
export function addCommandExamples(program: Command): void {
  for (const { path, command } of leafCommands(program)) {
    const examples = COMMAND_EXAMPLES[path];
    if (examples) addExamples(command, examples);
  }
}
