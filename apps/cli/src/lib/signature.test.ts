import { WEBHOOK_SIGNATURE_VECTORS } from '@mcid/contracts';
import { describe, expect, it } from 'vitest';
import { signBody } from './signature.js';

describe('signBody', () => {
  it.each(WEBHOOK_SIGNATURE_VECTORS)(
    'matches the vector the API verifier also checks (t=$timestamp)',
    ({ secret, timestamp, body, header }) => {
      expect(signBody(secret, body, timestamp)).toBe(header);
    },
  );
});
