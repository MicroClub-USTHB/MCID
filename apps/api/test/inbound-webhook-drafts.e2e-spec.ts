import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { encryptSecret } from '../src/common/utils/encryption.util';
import { signPayload } from '../src/common/utils/inbound-webhook-signature.util';
import {
  inboundWebhookDrafts,
  inboundWebhookSubmissions,
  inboundWebhooks,
} from '../src/database/entities';
import { createTestApp } from './helpers/create-app';
import {
  clearAllTables,
  closeTestDb,
  getTestDb,
  ProjectFixture,
  seedAdminContext,
  seedTestProject,
  TestDb,
} from './helpers/db';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

const SIGNING_SECRET = 'whsec_test';

// "mentor" only matters when the member asked for one, so that step is
// skipped for everyone else.
const STEPPED = {
  version: 1 as const,
  steps: [
    {
      key: 'identity',
      fields: [
        { key: 'name', type: 'string' as const, required: true },
        { key: 'wantsMentor', type: 'boolean' as const, required: true },
      ],
    },
    {
      key: 'mentor',
      condition: {
        op: 'eq' as const,
        field: 'identity.wantsMentor',
        value: true,
      },
      fields: [{ key: 'topic', type: 'string' as const, required: true }],
    },
    {
      key: 'final',
      fields: [{ key: 'comment', type: 'string' as const, required: false }],
    },
  ],
};

const FLAT = {
  version: 1 as const,
  fields: [{ key: 'name', type: 'string' as const, required: true }],
};

describeIf('inbound webhook drafts (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let project: ProjectFixture;
  let webhookId: string;
  let serverId: string;

  async function addWebhook(
    schema: object,
    overrides: Partial<typeof inboundWebhooks.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(inboundWebhooks)
      .values({
        projectId: project.id,
        name: 'Drafts',
        slug: `drafts-${Math.random().toString(36).slice(2, 8)}`,
        schema,
        signingSecretEnc: encryptSecret(
          SIGNING_SECRET,
          process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
        ),
        requireSignature: false,
        ...overrides,
      })
      .returning({ id: inboundWebhooks.id });
    return row.id;
  }

  const base = (id = webhookId) => `/api/inbound-webhooks/${id}`;
  const post = (url: string) => request(app.getHttpServer()).post(url);
  const patch = (url: string) => request(app.getHttpServer()).patch(url);

  async function openDraft(id = webhookId): Promise<string> {
    const res = await post(`${base(id)}/drafts`)
      .set('X-API-Key', project.apiKey)
      .expect(201);
    return res.body.draftId;
  }

  const sendStep = (draftId: string, step: string, body: object) =>
    patch(`${base()}/drafts/${draftId}/${step}`)
      .set('X-API-Key', project.apiKey)
      .send(body);

  const submitDraft = (draftId: string) =>
    post(`${base()}/drafts/${draftId}/submit`).set('X-API-Key', project.apiKey);

  beforeAll(async () => {
    db = getTestDb();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearAllTables(db);
    const admin = await seedAdminContext(db);
    serverId = admin.serverId;
    project = await seedTestProject(db, serverId);
    webhookId = await addWebhook(STEPPED);
  });

  it('opens a draft with an expiry', async () => {
    const res = await post(`${base()}/drafts`)
      .set('X-API-Key', project.apiKey)
      .expect(201);
    expect(res.body.draftId).toEqual(expect.any(String));
    const hours =
      (new Date(res.body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('fills step by step and submits one payload', async () => {
    const draftId = await openDraft();

    const first = await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: true,
    }).expect(200);
    expect(first.body.completedSteps).toEqual(['identity']);

    await sendStep(draftId, 'mentor', { topic: 'compilers' }).expect(200);
    const last = await sendStep(draftId, 'final', { comment: 'hi' }).expect(
      200,
    );
    expect(last.body.completedSteps).toEqual(['identity', 'mentor', 'final']);

    const res = await submitDraft(draftId).expect(201);

    const [stored] = await db
      .select()
      .from(inboundWebhookSubmissions)
      .where(eq(inboundWebhookSubmissions.id, res.body.id));
    expect(stored.payload).toEqual({
      identity: { name: 'Ada', wantsMentor: true },
      mentor: { topic: 'compilers' },
      final: { comment: 'hi' },
    });
    expect(stored.draftId).toBe(draftId);
  });

  it('checks only the step it is given, and reports every error in it', async () => {
    const draftId = await openDraft();
    const res = await sendStep(draftId, 'identity', {
      wantsMentor: 'yes',
    }).expect(422);
    expect(res.body.error).toBe('ValidationFailed');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(
      ['identity.name', 'identity.wantsMentor'],
    );
    // The other steps were never asked for
    const [draft] = await db.select().from(inboundWebhookDrafts);
    expect(draft.data).toEqual({});
    expect(draft.completedSteps).toEqual([]);
  });

  it('rejects a step the schema does not have', async () => {
    const draftId = await openDraft();
    const res = await sendStep(draftId, 'nope', {}).expect(422);
    expect(res.body.errors[0].code).toBe('UNKNOWN_STEP');
  });

  it('skips a step whose condition is false, at patch and at submit', async () => {
    const draftId = await openDraft();
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(200);

    // Sent anyway: accepted and ignored, never required
    const skipped = await sendStep(draftId, 'mentor', { topic: 'x' }).expect(
      200,
    );
    expect(skipped.body.completedSteps).toContain('mentor');

    const res = await submitDraft(draftId).expect(201);
    const [stored] = await db
      .select()
      .from(inboundWebhookSubmissions)
      .where(eq(inboundWebhookSubmissions.id, res.body.id));
    // The mentor step is gone; the optional final step was never sent
    expect(stored.payload).toEqual({
      identity: { name: 'Ada', wantsMentor: false },
      final: {},
    });
  });

  it('fails the submit when a required step was never sent', async () => {
    const draftId = await openDraft();
    const res = await submitDraft(draftId).expect(422);
    expect(res.body.errors.map((e: { code: string }) => e.code)).toContain(
      'REQUIRED',
    );
    // Still open, so the caller can fix it and try again
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(200);
    await submitDraft(draftId).expect(201);
  });

  it('rechecks the whole payload when an earlier step changes', async () => {
    const draftId = await openDraft();
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(200);
    // Changing the answer makes the mentor step required, and it was never sent
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: true,
    }).expect(200);
    const res = await submitDraft(draftId).expect(422);
    expect(res.body.errors[0].path).toBe('mentor.topic');
  });

  it('resumes: a step can be sent again and the saved steps are reported', async () => {
    const draftId = await openDraft();
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(200);
    const again = await sendStep(draftId, 'identity', {
      name: 'Grace',
      wantsMentor: false,
    }).expect(200);
    expect(again.body.completedSteps).toEqual(['identity']);

    const res = await submitDraft(draftId).expect(201);
    const [stored] = await db
      .select()
      .from(inboundWebhookSubmissions)
      .where(eq(inboundWebhookSubmissions.id, res.body.id));
    expect(stored.payload).toMatchObject({ identity: { name: 'Grace' } });
  });

  it('rejects a second submit of the same draft', async () => {
    const draftId = await openDraft();
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(200);
    await submitDraft(draftId).expect(201);
    await submitDraft(draftId).expect(409);
    await sendStep(draftId, 'final', {}).expect(409);
    expect(await db.select().from(inboundWebhookSubmissions)).toHaveLength(1);
  });

  it('accepts only one of two concurrent submits', async () => {
    const draftId = await openDraft();
    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(200);
    const results = await Promise.all([
      submitDraft(draftId),
      submitDraft(draftId),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.select().from(inboundWebhookSubmissions)).toHaveLength(1);
  });

  it('answers 410 for an expired draft and marks it expired', async () => {
    const draftId = await openDraft();
    await db
      .update(inboundWebhookDrafts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(inboundWebhookDrafts.id, draftId));

    await sendStep(draftId, 'identity', {
      name: 'Ada',
      wantsMentor: false,
    }).expect(410);
    await submitDraft(draftId).expect(410);
    const [draft] = await db.select().from(inboundWebhookDrafts);
    expect(draft.status).toBe('expired');
  });

  it('answers 404 for an unknown draft or one that belongs to another webhook', async () => {
    await sendStep(
      '00000000-0000-4000-8000-000000000000',
      'identity',
      {},
    ).expect(404);
    await sendStep('not-a-uuid', 'identity', {}).expect(404);

    const otherId = await addWebhook(STEPPED);
    const otherDraft = await openDraft(otherId);
    await sendStep(otherDraft, 'identity', {}).expect(404);
  });

  it("answers 404 for another project's webhook and draft", async () => {
    const draftId = await openDraft();
    const other = await seedTestProject(db, serverId, { name: 'Other' });

    await post(`${base()}/drafts`).set('X-API-Key', other.apiKey).expect(404);
    await patch(`${base()}/drafts/${draftId}/identity`)
      .set('X-API-Key', other.apiKey)
      .send({ name: 'Ada', wantsMentor: false })
      .expect(404);
    await post(`${base()}/drafts/${draftId}/submit`)
      .set('X-API-Key', other.apiKey)
      .expect(404);
  });

  it('refuses a draft on a webhook without steps', async () => {
    const flatId = await addWebhook(FLAT);
    await post(`${base(flatId)}/drafts`)
      .set('X-API-Key', project.apiKey)
      .expect(400);
  });

  it('answers 410 when the webhook is inactive', async () => {
    await db
      .update(inboundWebhooks)
      .set({ isActive: false })
      .where(eq(inboundWebhooks.id, webhookId));
    await post(`${base()}/drafts`).set('X-API-Key', project.apiKey).expect(410);
  });

  describe('with a required signature', () => {
    beforeEach(async () => {
      await db
        .update(inboundWebhooks)
        .set({ requireSignature: true })
        .where(eq(inboundWebhooks.id, webhookId));
    });

    it('signs the empty string for the bodyless calls and the body for a step', async () => {
      const open = await post(`${base()}/drafts`)
        .set('X-API-Key', project.apiKey)
        .set('X-MCID-Signature', signPayload(SIGNING_SECRET, ''))
        .expect(201);
      const draftId = open.body.draftId;

      const body = JSON.stringify({ name: 'Ada', wantsMentor: false });
      await patch(`${base()}/drafts/${draftId}/identity`)
        .set('X-API-Key', project.apiKey)
        .set('Content-Type', 'application/json')
        .set('X-MCID-Signature', signPayload(SIGNING_SECRET, body))
        .send(body)
        .expect(200);

      await post(`${base()}/drafts/${draftId}/submit`)
        .set('X-API-Key', project.apiKey)
        .set(
          'X-MCID-Signature',
          signPayload(SIGNING_SECRET, '', Math.floor(Date.now() / 1000) + 1),
        )
        .expect(201);
    });

    it('rejects an unsigned call', async () => {
      await post(`${base()}/drafts`)
        .set('X-API-Key', project.apiKey)
        .expect(401);
    });
  });
});
