import { createHmac } from 'node:crypto';

/** The `X-MCID-Signature` value the API verifies: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
export function signBody(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const hex = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${hex}`;
}
