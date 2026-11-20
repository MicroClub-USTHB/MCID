import type { Command } from 'commander';
import { exitWithError } from '../errors.js';
import { getClient } from './client.js';
import { promptIfMissing, type SelectChoice } from './prompts.js';
import { resolveServer } from './resolver.js';

type Kind = 'project' | 'server' | 'role' | 'webhook' | 'text';

/**
 * Arguments we must never ask for: secrets, local file paths, raw IDs lists
 * and shell names. Those stay Commander-required so scripts fail immediately.
 */
const NEVER_PROMPT = new Set([
  'path',
  'schema-path',
  'file',
  'token',
  'refreshtoken',
  'shell',
  'permissions',
  'grants',
  'pairs',
  'key',
  'profile',
  'apikey',
  'api-key',
]);

/** Only non-default kinds need listing; everything else is free text. */
const ARG_KINDS: Record<string, Kind> = {
  project: 'project',
  server: 'server',
  role: 'role',
  sourceRole: 'role',
  webhook: 'webhook',
};

interface PromptSpec {
  kind: Kind;
  flag: string;
  index?: number;
  attribute?: string;
  variadic?: boolean;
}

function kindFor(name: string): Kind {
  return ARG_KINDS[name] ?? 'text';
}

function isForbidden(name: string): boolean {
  return NEVER_PROMPT.has(name);
}

async function choicesFor(kind: Kind, command: Command): Promise<SelectChoice[]> {
  const opts = command.optsWithGlobals() as { profile?: string; server?: string };
  const client = await getClient(opts.profile);
  if (kind === 'project') {
    const rows = await client.get<{ id: string; name: string }[]>('/admin/projects', {
      resource: 'project',
    });
    return rows.map((row) => ({ name: row.name, value: row.id }));
  }
  if (kind === 'server') {
    const rows = await client.get<{ id: string; name: string }[]>('/servers', {
      resource: 'server',
    });
    return rows.map((row) => ({ name: row.name, value: row.id }));
  }
  if (kind === 'webhook') {
    const rows = await client.get<{ id: string; name: string }[]>('/admin/inbound-webhooks', {
      resource: 'webhook',
    });
    return rows.map((row) => ({ name: row.name, value: row.id }));
  }
  if (kind === 'role') {
    // Honour --server so the picker lists roles of the requested guild.
    const server = await resolveServer(client, opts.server);
    const rows = await client.get<{ id: string; name: string }[]>(
      `/admin/stats/roles?serverId=${encodeURIComponent(server.id)}`,
    );
    return rows.map((row) => ({ name: row.name, value: row.id }));
  }
  return [];
}

/**
 * Turn omitted required arguments into TTY prompts across the whole command
 * tree. Secrets, file paths and machine-only values stay required, so a
 * non-interactive caller still gets an immediate usage error instead of a hang.
 */
export function enablePromptableArgs(program: Command): void {
  const specs = new WeakMap<Command, PromptSpec[]>();

  const visit = (command: Command): void => {
    for (const child of command.commands) {
      const list: PromptSpec[] = [];

      child.registeredArguments.forEach((arg, index) => {
        if (!arg.required || isForbidden(arg.name())) return;
        arg.required = false;
        list.push({ kind: kindFor(arg.name()), flag: `<${arg.name()}>`, index });
      });

      for (const option of child.options) {
        if (!option.mandatory) continue;
        const name = (option.long ?? option.short ?? '').replace(/^-+/, '');
        if (isForbidden(name)) continue;
        // `mandatory` is "must be supplied"; `required` only means it takes a value.
        option.mandatory = false;
        list.push({
          kind: kindFor(name),
          flag: option.flags,
          attribute: option.attributeName(),
          variadic: option.variadic,
        });
      }

      if (list.length > 0) specs.set(child, list);
      visit(child);
    }
  };

  visit(program);

  program.hook('preAction', async (_parent, actionCommand) => {
    const list = specs.get(actionCommand);
    if (!list) return;
    try {
      for (const spec of list) {
        const current =
          spec.index !== undefined
            ? actionCommand.processedArgs[spec.index]
            : (actionCommand.opts() as Record<string, unknown>)[spec.attribute!];
        if (current !== undefined && current !== '') continue;

        const value = await promptIfMissing({
          value: current as string | undefined,
          flag: spec.flag,
          message: spec.flag,
          ...(spec.kind === 'text' ? {} : { choices: () => choicesFor(spec.kind, actionCommand) }),
        });
        if (spec.index !== undefined) {
          actionCommand.processedArgs[spec.index] = value;
        } else {
          actionCommand.setOptionValue(
            spec.attribute!,
            spec.variadic
              ? String(value)
                  .split(/[\s,]+/)
                  .filter(Boolean)
              : value,
          );
        }
      }
    } catch (err) {
      // The hook runs outside each action's own try/catch, so map errors here.
      exitWithError(actionCommand.name(), err);
    }
  });
}
