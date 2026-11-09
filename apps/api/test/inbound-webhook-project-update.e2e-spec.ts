import { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { encryptSecret } from '../src/common/utils/encryption.util';
import { signPayload } from '../src/common/utils/inbound-webhook-signature.util';
import { auditLogs, inboundWebhooks } from '../src/database/entities';
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

const OLD_SECRET = 'whsec_old';
// Stepped, so a bodyless signed `POST /drafts` can probe which secret verifies.
const STEPPED = {
  version: 1,
  steps: [
    { key: 'one', fields: [{ key: 'name', type: 'string', required: true }] },
  ],
};
const SCHEMA = {
  version: 1,
  fields: [{ key: 'name', type: 'string', required: true }],
};

describeIf('project inbound webhook update and rotation (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let mine: ProjectFixture;
  let other: ProjectFixture;
  let webhookId: string;

  const http = () => request(app.getHttpServer());
  const url = (id = webhookId) => `/api/project/inbound-webhooks/${id}`;
  const openDraft = (secret: string) =>
    http()
      .post(`/api/inbound-webhooks/${webhookId}/drafts`)
      .set('X-API-Key', mine.apiKey)
      .set('X-MCID-Signature', signPayload(secret, ''));

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
    mine = await seedTestProject(db, admin.serverId, { name: 'Mine' });
    other = await seedTestProject(db, admin.serverId, { name: 'Other' });
    const [row] = await db
      .insert(inboundWebhooks)
      .values({
        projectId: mine.id,
        name: 'Form',
        slug: 'form',
        schema: STEPPED as never,
        signingSecretEnc: encryptSecret(
          OLD_SECRET,
          process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
        ),
        requireSignature: true,
      })
      .returning({ id: inboundWebhooks.id });
    webhookId = row.id;
  });

  it('stores a valid schema, answers the list projection and audits it', async () => {
    const res = await http()
      .patch(url())
      .set('X-API-Key', mine.apiKey)
      .send({ name: 'Renamed', schema: SCHEMA })
      .expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      'active',
      'createdAt',
      'id',
      'name',
      'schema',
      'slug',
    ]);
    expect(res.body).toMatchObject({ name: 'Renamed', schema: SCHEMA });
    const [stored] = await db
      .select()
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.id, webhookId));
    expect(stored.schema).toEqual(SCHEMA);
    const audits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, webhookId),
          eq(auditLogs.action, 'webhook.updated'),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toMatchObject({ projectId: mine.id });
  });

  it('answers 422 for an invalid schema and stores nothing', async () => {
    const res = await http()
      .patch(url())
      .set('X-API-Key', mine.apiKey)
      .send({ schema: { version: 1 } })
      .expect(422);

    expect(res.body.error).toBe('InvalidSchema');
    const [stored] = await db
      .select()
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.id, webhookId));
    expect(stored.schema).toEqual(STEPPED);
  });

  it('answers 400 for a field a project may not change', async () => {
    await http()
      .patch(url())
      .set('X-API-Key', mine.apiKey)
      .send({ requireSignature: false })
      .expect(400);
  });

  it('rotates the secret: the old one stops verifying, the new one works', async () => {
    await openDraft(OLD_SECRET).expect(201);

    const res = await http()
      .post(`${url()}/rotate-secret`)
      .set('X-API-Key', mine.apiKey)
      .expect(200);

    expect(Object.keys(res.body)).toEqual(['secret']);
    expect(res.body.secret).toMatch(/^whsec_/);
    await openDraft(OLD_SECRET).expect(401);
    await openDraft(res.body.secret).expect(201);
  });

  it("answers 404 for another project's webhook on both routes", async () => {
    await http()
      .patch(url())
      .set('X-API-Key', other.apiKey)
      .send({ schema: SCHEMA })
      .expect(404);
    await http()
      .post(`${url()}/rotate-secret`)
      .set('X-API-Key', other.apiKey)
      .expect(404);
    await openDraft(OLD_SECRET).expect(201);
  });

  it('answers 401 without a valid key', async () => {
    await http().patch(url()).send({ schema: SCHEMA }).expect(401);
    await http().post(`${url()}/rotate-secret`).expect(401);
  });
});
