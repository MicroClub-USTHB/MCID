import { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
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

const SCHEMA = {
  version: 1,
  fields: [{ key: 'name', type: 'string', required: true }],
};

describeIf('POST /api/project/inbound-webhooks (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let mine: ProjectFixture;
  let unscoped: ProjectFixture;
  let serverId: string;
  let roleId: string;

  const create = (
    body: object,
    key = mine.apiKey,
    qs = `?serverId=${serverId}`,
  ) =>
    request(app.getHttpServer())
      .post(`/api/project/inbound-webhooks${qs}`)
      .set('X-API-Key', key)
      .send(body);
  const valid = (over: object = {}) => ({
    name: 'Hackathon 2026',
    slug: 'hackathon-2026',
    schema: SCHEMA,
    allowedRoleIds: [roleId],
    ...over,
  });

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
    roleId = admin.roleId;
    mine = await seedTestProject(db, serverId, {
      name: 'Mine',
      scopes: ['manage_inbound_webhooks'],
    });
    unscoped = await seedTestProject(db, serverId, { name: 'Unscoped' });
  });

  it('creates for the key project, returns the secret once and audits it', async () => {
    const res = await create(valid()).expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['id', 'secret', 'slug']);
    expect(res.body.secret).toMatch(/^whsec_/);
    const [stored] = await db
      .select()
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.id, res.body.id));
    expect(stored).toMatchObject({
      projectId: mine.id,
      slug: 'hackathon-2026',
      createdBy: null,
    });
    const audits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, res.body.id),
          eq(auditLogs.action, 'webhook.created'),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0].details).toMatchObject({ projectId: mine.id });

    const list = await request(app.getHttpServer())
      .get('/api/project/inbound-webhooks')
      .set('X-API-Key', mine.apiKey)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(res.body.secret);
  });

  it('answers 409 for a slug the project already uses', async () => {
    await create(valid()).expect(201);
    await create(valid({ name: 'Again' })).expect(409);
  });

  it('answers 422 listing the schema errors and stores nothing', async () => {
    const res = await create(valid({ schema: { version: 1 } })).expect(422);

    expect(res.body.error).toBe('InvalidSchema');
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(await db.select().from(inboundWebhooks)).toHaveLength(0);
  });

  it('answers 400 for a projectId in the body', async () => {
    await create(valid({ projectId: unscoped.id })).expect(400);
    expect(await db.select().from(inboundWebhooks)).toHaveLength(0);
  });

  it('answers 400 for an unknown reader role', async () => {
    await create(valid({ allowedRoleIds: ['799999999999999999'] })).expect(400);
  });

  it('answers 403 without the manage_inbound_webhooks scope, 400 without serverId', async () => {
    await create(valid(), unscoped.apiKey).expect(403);
    await create(valid(), mine.apiKey, '').expect(400);
  });

  it('answers 401 without a valid key', async () => {
    await request(app.getHttpServer())
      .post(`/api/project/inbound-webhooks?serverId=${serverId}`)
      .send(valid())
      .expect(401);
  });
});
