import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// getStoredSigningSecret decrypts with the OS keychain via defaultKeyProvider;
// in tests the stored entry is plaintext and decrypt simply returns it, so no
// real keychain is ever touched.
vi.mock('../crypto-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crypto-store.js')>();
  return {
    ...actual,
    defaultKeyProvider: () => ({
      keyForWrite: async () => ({ source: 'keychain' as const, key: Buffer.alloc(32) }),
      keyFor: async () => Buffer.alloc(32),
    }),
    decrypt: vi.fn(async (ciphertext: string) => ciphertext),
  };
});

import { cleanupCliTest, json, runCli } from '../test-support/cli-harness.js';
import { baseRoutes, inboundWebhook, WEBHOOK_ID } from '../test-support/fixtures.js';
import { setWebhookSecret, updateConfig, type Config } from '../config.js';

afterEach(cleanupCliTest);

async function configWithStoredSecret(tmp: string): Promise<string> {
  const path = join(tmp, 'config.json');
  vi.stubEnv('MCID_CLI_CONFIG_PATH', path);
  await updateConfig(path, (config: Config) =>
    setWebhookSecret(
      {
        ...config,
        activeProfile: 'default',
        profiles: { default: { baseUrl: 'http://localhost:3000', session: null } },
      },
      'default',
      WEBHOOK_ID,
      { secret: 'whsec_test_secret', name: inboundWebhook.name, slug: inboundWebhook.slug },
    ),
  );
  return path;
}

// Real schemas use step.key and field.key; the payload nests each step under
// its key, exactly as payload.validator.ts reads it.
const steppedSchema = {
  version: 1,
  steps: [
    {
      key: 'contact',
      title: 'Contact',
      fields: [
        { key: 'message', type: 'string', required: true, minLength: 3 },
        {
          key: 'topic',
          type: 'enum',
          required: true,
          options: [
            { value: 'support', label: 'Support' },
            { value: 'sales', label: 'Sales' },
          ],
        },
        {
          key: 'profile',
          type: 'object',
          required: true,
          fields: [{ key: 'bio', type: 'text', required: true }],
        },
        {
          key: 'tags',
          type: 'array',
          required: true,
          minItems: 1,
          maxItems: 3,
          item: { key: 'tag', type: 'string' },
        },
      ],
    },
  ],
};

const conditionalSchema = {
  version: 1,
  steps: [
    {
      key: 'apply',
      fields: [
        {
          key: 'status',
          type: 'enum',
          required: true,
          options: [{ value: 'student' }, { value: 'worker' }],
        },
        {
          key: 'studentId',
          type: 'string',
          required: true,
          condition: { op: 'eq', field: 'apply.status', value: 'student' },
        },
      ],
    },
  ],
};

function sendRoutes(schema: unknown = steppedSchema) {
  return baseRoutes({
    [`GET /admin/inbound-webhooks/${WEBHOOK_ID}`]: () =>
      json({
        ...inboundWebhook,
        schema,
        requireSignature: true,
        acceptedOrigins: ['https://portal.example.com'],
      }),
  });
}

describe('webhook send --print-curl', () => {
  it('masks the API key unless --reveal is passed', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-send-'));
    await configWithStoredSecret(tmp);

    const masked = await runCli(
      [
        'webhook',
        'send',
        'contact-form',
        '--example',
        '--print-curl',
        '--api-key',
        'mcid_live_supersecretkey123',
      ],
      { routes: sendRoutes() },
    );
    expect(masked.exitCode).toBe(0);
    expect(masked.stdout).not.toContain('mcid_live_supersecretkey123');
    expect(masked.stdout).toContain('<MCID_API_KEY>');

    const revealed = await runCli(
      [
        'webhook',
        'send',
        'contact-form',
        '--example',
        '--print-curl',
        '--reveal',
        '--api-key',
        'mcid_live_supersecretkey123',
      ],
      { routes: sendRoutes() },
    );
    expect(revealed.exitCode).toBe(0);
    expect(revealed.stdout).toContain('mcid_live_supersecretkey123');
  });

  it('prints a real HMAC signature instead of a placeholder', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-send-'));
    await configWithStoredSecret(tmp);

    const result = await runCli(['webhook', 'send', 'contact-form', '--example', '--print-curl'], {
      routes: sendRoutes(),
    });

    expect(result.exitCode).toBe(0);
    // t=<unix seconds>,v1=<sha256 hex> over "<timestamp>.<body>"
    expect(result.stdout).toMatch(/X-MCID-Signature: t=\d+,v1=[0-9a-f]{64}/);
    expect(result.stdout).not.toContain('<HMAC_SHA256>');
    expect(result.stdout).not.toContain('<UNIX_TIMESTAMP>');
  });
});

describe('webhook send --example', () => {
  it('builds the payload from steps[].fields with enum option values', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-send-'));
    await configWithStoredSecret(tmp);

    const result = await runCli(['webhook', 'send', 'contact-form', '--example', '--print-curl'], {
      routes: sendRoutes(),
    });

    expect(result.exitCode).toBe(0);
    // -d '<json>' body: each step nests under its key, enum emits its value
    const payloadMatch = result.stdout.match(/-d '([\s\S]*)'/);
    expect(payloadMatch).not.toBeNull();
    const payload = JSON.parse(payloadMatch![1] as string) as Record<string, unknown>;
    const step = payload['contact'] as Record<string, unknown>;
    expect(step).toBeTypeOf('object');
    expect(step['message']).toBeTypeOf('string');
    expect(step['topic']).toBe('support');
    // never the {value,label} object the API rejects
    expect(step['topic']).not.toMatch(/value/);
    // object and array fields are built in their real shapes
    expect(step['profile']).toMatchObject({ bio: expect.any(String) });
    expect(step['tags']).toEqual([expect.any(String)]);
  });

  it('follows conditions, so the branch field it selects is included', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-send-'));
    await configWithStoredSecret(tmp);

    const result = await runCli(['webhook', 'send', 'contact-form', '--example', '--print-curl'], {
      routes: sendRoutes(conditionalSchema),
    });

    expect(result.exitCode).toBe(0);
    const payloadMatch = result.stdout.match(/-d '([\s\S]*)'/);
    const payload = JSON.parse(payloadMatch![1] as string) as Record<string, unknown>;
    expect(payload['apply']).toMatchObject({
      status: 'student',
      studentId: expect.any(String),
    });
  });
});

describe('webhook send --data schema validation', () => {
  it('rejects a payload missing required fields before sending anything', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-send-'));
    await configWithStoredSecret(tmp);
    const dataFile = join(tmp, 'payload.json');
    await writeFile(dataFile, JSON.stringify({ contact: { message: 'hi' } }), 'utf8');

    const result = await runCli(
      ['webhook', 'send', 'contact-form', '--data', dataFile, '--api-key', 'mcid_live_key'],
      { routes: sendRoutes() },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('contact.topic');
    // no request to the ingest endpoint was made
    expect(result.requests.some((r) => r.path === `/inbound-webhooks/${WEBHOOK_ID}/submit`)).toBe(
      false,
    );
  });

  it('accepts a correct nested payload instead of rejecting it locally', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcid-send-'));
    await configWithStoredSecret(tmp);
    const dataFile = join(tmp, 'payload.json');
    await writeFile(
      dataFile,
      JSON.stringify({
        contact: {
          message: 'hello',
          topic: 'support',
          profile: { bio: 'A short bio.' },
          tags: ['one'],
        },
      }),
      'utf8',
    );

    const result = await runCli(
      ['webhook', 'send', 'contact-form', '--data', dataFile, '--print-curl'],
      { routes: sendRoutes() },
    );

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });
});
