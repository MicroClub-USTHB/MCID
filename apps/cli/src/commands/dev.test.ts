import { describe, expect, it } from 'vitest';
import { createPkcePair } from '../pkce.js';

describe('dev sso helpers', () => {
  it('generates valid PKCE code verifier and challenge for SSO', () => {
    const pkce = createPkcePair();
    expect(pkce.verifier).toBeDefined();
    expect(pkce.challenge).toBeDefined();
    expect(pkce.verifier.length).toBeGreaterThan(40);
    expect(pkce.challenge.length).toBeGreaterThan(40);
  });
});
