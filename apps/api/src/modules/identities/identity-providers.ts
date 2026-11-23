/** Providers a member can link an account for. Adding one = one entry here. */
export interface IdentityProviderRule {
  /** Normalises and validates a typed handle; null when it is not valid. */
  normalizeHandle(raw: string): string | null;
}

const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

export const IDENTITY_PROVIDERS = {
  github: {
    normalizeHandle: (raw: string) => {
      const handle = raw.trim().replace(/^@/, '').toLowerCase();
      return GITHUB_LOGIN.test(handle) && !handle.includes('--')
        ? handle
        : null;
    },
  },
} as const satisfies Record<string, IdentityProviderRule>;

export type IdentityProvider = keyof typeof IDENTITY_PROVIDERS;

export const IDENTITY_PROVIDER_NAMES: IdentityProvider[] = ['github'];

export const isIdentityProvider = (value: string): value is IdentityProvider =>
  (IDENTITY_PROVIDER_NAMES as string[]).includes(value);
