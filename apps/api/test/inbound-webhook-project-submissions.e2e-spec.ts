import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { encryptSecret } from '../src/common/utils/encryption.util';
import {
  auditLogs,
  inboundWebhooks,
  inboundWebhookSubmissions,
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

describeIf('GET /api/project/inbound-webhooks/:id/submissions (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let mine: ProjectFixture;
  let other: ProjectFixture;
  let webhookId: string;
  let foreignWebhookId: string;

  const addWebhook = async (projectId: string, slug: string) => {
    const [w] = await db
      .insert(inboundWebhooks)
      .values({
        projectId,
        name: slug,
        slug,
        schema: { version: 1, fields: [] } as never,
        signingSecretEnc: encryptSecret(
          'whsec_x',
          process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
        ),
      })
      .returning({ id: inboundWebhooks.id });
    return w.id;
  };

  const addSubmissions = (n: number, from = 0) =>
    db.insert(inboundWebhookSubmissions).values(
      Array.from({ length: n }, (_, k) => ({
        webhookId,
        projectId: mine.id,
        payload: { n: from + k },
        // identical timestamps on purpose: the id must break the tie
        receivedAt: new Date(
          Date.UTC(2026, 0, 1) + Math.floor((from + k) / 2) * 1000,
        ),
      })),
    );

  const get = (id: string, qs = '', key = mine.apiKey) =>
    request(app.getHttpServer())
      .get(`/api/project/inbound-webhooks/${id}/submissions${qs}`)
      .set('X-API-Key', key);

  const drain = async (limit: number) => {
    const seen: { id: string; receivedAt: string; payload: { n: number } }[] =
      [];
    let cursor: string | null = null;
    do {
      const qs: string = `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await get(webhookId, qs).expect(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
    } while (cursor);
    return seen;
  };

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
    webhookId = await addWebhook(mine.id, 'mine');
    foreignWebhookId = await addWebhook(other.id, 'foreign');
  });

  it('pages 250 submissions oldest first, each exactly once', async () => {
    await addSubmissions(250);
    const seen = await drain(100);
    expect(seen).toHaveLength(250);
    expect(new Set(seen.map((s) => s.id)).size).toBe(250);
    const times = seen.map((s) => Date.parse(s.receivedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('skips and repeats nothing when rows arrive between pages', async () => {
    await addSubmissions(10);
    const first = await get(webhookId, '?limit=5').expect(200);
    await addSubmissions(5, 10);
    const second = await get(
      webhookId,
      `?limit=100&cursor=${first.body.nextCursor}`,
    ).expect(200);
    const ns = [...first.body.items, ...second.body.items].map(
      (s: { payload: { n: number } }) => s.payload.n,
    );
    expect([...ns].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 15 }, (_, i) => i),
    );
    expect(second.body.nextCursor).toBeNull();
  });

  it('filters on receivedAt and returns the member-endpoint fields', async () => {
    await addSubmissions(10);
    const res = await get(
      webhookId,
      '?dateFrom=2026-01-01T00:00:03Z&dateTo=2026-01-01T00:00:03Z',
    ).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      'id',
      'origin',
      'payload',
      'receivedAt',
    ]);
  });

  it('answers 400 for a malformed cursor and for limit above 200', async () => {
    await get(webhookId, '?cursor=not-a-cursor').expect(400);
    // JS Date.parse accepts both, Postgres does not
    for (const r of ['1', '2026-02-31 00:00:00+00']) {
      const cursor = Buffer.from(
        JSON.stringify({ r, i: '11111111-1111-4111-8111-111111111111' }),
      ).toString('base64url');
      await get(webhookId, `?cursor=${cursor}`).expect(400);
    }
    await get(webhookId, '?limit=201').expect(400);
  });

  it("answers 404 for another project's webhook and for an unknown one", async () => {
    await get(foreignWebhookId).expect(404);
    await get('11111111-1111-4111-8111-111111111111').expect(404);
  });

  it('answers 401 without a valid key', async () => {
    await request(app.getHttpServer())
      .get(`/api/project/inbound-webhooks/${webhookId}/submissions`)
      .expect(401);
  });

  it('audits every read', async () => {
    await addSubmissions(1);
    await get(webhookId).expect(200);
    const rows = await db.select().from(auditLogs);
    expect(rows.filter((r) => r.action === 'submissions.read')).toHaveLength(1);
  });
});
