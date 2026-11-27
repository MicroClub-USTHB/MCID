import { configPath, loadConfig, resolveProfileName } from '../config.js';
import { defaultKeyProvider } from '../crypto-store.js';
import { CliError, ExitCode } from '../errors.js';
import { resolveSession, type Session } from '../session.js';
import { mapApiError } from './error-mapping.js';
import { colors } from './tui.js';

/** Builds an authenticated client from the active (or named) profile. */
export async function getClient(profile?: string): Promise<ApiClient> {
  const config = await loadConfig(configPath());
  const name = resolveProfileName(config, profile);
  const session = await resolveSession(config, name, defaultKeyProvider());
  return new ApiClient(session);
}

export interface RequestOptions {
  headers?: Record<string, string> | undefined;
  body?: unknown;
  timeout?: number | undefined;
  resource?: string | undefined;
  id?: string | undefined;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly profileName: string;
  private readonly debug: boolean;

  constructor(session: Session, options?: { debug?: boolean | undefined }) {
    this.baseUrl = session.baseUrl.replace(/\/api$/, '');
    this.token = session.token;
    this.profileName = session.profileName;
    this.debug = Boolean(options?.debug || process.env.MCID_DEBUG === '1');
  }

  get isEnvToken(): boolean {
    return Boolean(process.env.MCID_TOKEN);
  }

  get activeProfile(): string {
    return this.profileName;
  }

  get origin(): string {
    return this.baseUrl;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let bodyStr: string | undefined;
    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        bodyStr = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        bodyStr = JSON.stringify(options.body);
      }
    }

    // Query strings may contain credentials or personal data; do not log them.
    const debugPath = path.split(/[?#]/, 1)[0] ?? '';
    const start = Date.now();
    let res: Response;

    try {
      const init: RequestInit = {
        method,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeout ?? 15_000),
      };
      if (bodyStr !== undefined) {
        init.body = bodyStr;
      }
      res = await fetch(url, init);
    } catch (err) {
      // Runtime errors may include the request URL, headers, or credentials.
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      if (this.debug) {
        process.stderr.write(`${colors.dim(`[debug] ${method} ${debugPath} -> FAILED`)}\n`);
      }
      throw new CliError(
        `Could not reach MCID${timedOut ? ' (request timed out)' : ''}\n  hint: check your internet connection or run \`mcid-cli doctor\``,
        ExitCode.Unexpected,
      );
    }

    const duration = Date.now() - start;
    if (this.debug) {
      process.stderr.write(
        `${colors.dim(`[debug] ${method} ${debugPath} -> ${res.status} (${duration}ms)`)}\n`,
      );
    }

    if (res.ok) {
      if (res.status === 204) {
        return undefined as unknown as T;
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    }

    if (res.status === 429) {
      const header = res.headers.get('retry-after');
      const seconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
      throw new CliError(
        `MCID is rate-limiting this client${seconds !== undefined ? `; retry after ${seconds}s` : ''}\n  hint: wait for the window to pass, or reduce how often the command runs`,
        ExitCode.Rejected,
      );
    }

    let parsedBody: unknown;
    try {
      parsedBody = await res.json();
    } catch {
      parsedBody = await res.text().catch(() => null);
    }

    throw mapApiError(res.status, parsedBody, {
      profileName: this.profileName,
      ...(options.resource !== undefined ? { resource: options.resource } : {}),
      ...(options.id !== undefined ? { id: options.id } : {}),
    });
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}
