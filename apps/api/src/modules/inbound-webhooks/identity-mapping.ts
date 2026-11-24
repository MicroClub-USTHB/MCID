import { IDENTITY_PROVIDER_NAMES } from '../identities/identity-providers';

/**
 * Tells a webhook to turn each accepted submission into an account link:
 * the member comes from one payload field, the username from another.
 *
 * Field paths address the stored payload, so a stepped schema uses
 * `step.field` (e.g. `profile.github`) and a flat one just `field`.
 */
export interface IdentityMapping {
  provider: string;
  memberIdField: string;
  handleField: string;
}

export const IDENTITY_MAPPING_PROVIDERS: readonly string[] =
  IDENTITY_PROVIDER_NAMES;

/** Reads `a.b.c` out of a nested payload; undefined when any hop is missing. */
export const readPayloadPath = (
  payload: Record<string, unknown>,
  path: string,
): unknown => {
  let current: unknown = payload;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};
