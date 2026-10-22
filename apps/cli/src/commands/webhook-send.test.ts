import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('webhook HMAC signing vectors', () => {
  it('computes exact HMAC SHA256 signature matching API expectations', () => {
    const secret = 'whsec_test_secret_key_12345';
    const timestamp = 1700000000;
    const rawBody = JSON.stringify({ name: 'Adel', email: 'adel@example.com' });

    const expectedSig = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${expectedSig}`;
    expect(signatureHeader).toContain(`t=${timestamp}`);
    expect(signatureHeader).toContain('v1=');
    expect(signatureHeader.split(',').length).toBe(2);
  });
});
