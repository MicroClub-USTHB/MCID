import { CliError, ExitCode } from '../errors.js';

export function mapApiError(
  status: number,
  body: unknown,
  context?: { profileName?: string; resource?: string; id?: string },
): CliError {
  const b = body as { message?: unknown; errors?: unknown; retryAfter?: unknown; error?: unknown } | null;
  const profile = context?.profileName || 'default';
  const resource = context?.resource || 'resource';
  const id = context?.id;

  let detail = '';
  if (Array.isArray(b?.errors) && b.errors.length > 0) {
    detail = b.errors
      .map((e: { path?: unknown; code?: unknown; message?: unknown }) =>
        [e.path, e.code, e.message].filter((x) => typeof x === 'string' && x).join(' '),
      )
      .join('; ');
  } else if (Array.isArray(b?.message)) {
    detail = b.message.join('; ');
  } else if (typeof b?.message === 'string') {
    detail = b.message;
  }

  if (status === 401) {
    return new CliError(
      `MCID rejected the session (invalid or expired)\n  hint: run \`mcid-cli login --profile ${profile}\``,
      ExitCode.Auth,
    );
  }

  if (status === 403) {
    const msg = detail || `permission denied for ${resource}`;
    return new CliError(
      `Access denied: ${msg}\n  hint: check your admin permissions with \`mcid-cli access explain\``,
      ExitCode.Auth,
    );
  }

  if (status === 404) {
    const target = id ? `${resource} "${id}"` : resource;
    return new CliError(
      `Not found: ${target}${detail ? ` (${detail})` : ''}\n  hint: verify the identifier or run \`mcid-cli ${resource} list\``,
      ExitCode.NotFound,
    );
  }

  if (status === 409) {
    return new CliError(
      `Conflict: ${detail || `${resource} conflict`}\n  hint: check existing records before creating or updating`,
      ExitCode.Rejected,
    );
  }

  if (status === 400 || status === 422) {
    return new CliError(
      `Invalid request: ${detail || 'validation failed'}\n  hint: check your input flags and schema`,
      ExitCode.Rejected,
    );
  }

  if (status === 429) {
    const retry = b?.retryAfter ? ` (retry in ${b.retryAfter}s)` : '';
    return new CliError(
      `Rate limited by MCID server${retry}\n  hint: please wait before retrying this command`,
      ExitCode.Unexpected,
    );
  }

  return new CliError(
    `MCID server error (HTTP ${status})${detail ? `: ${detail}` : ''}`,
    ExitCode.Unexpected,
  );
}
