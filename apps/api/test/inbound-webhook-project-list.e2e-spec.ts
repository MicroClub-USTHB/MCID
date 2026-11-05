import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { encryptSecret } from '../src/common/utils/encryption.util';
import { inboundWebhooks } from '../src/database/entities';
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

describeIf('GET /api/project/inbound-webhooks (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let mine: ProjectFixture;
  let other: ProjectFixture;

  const add = (projectId: string, slug: string, createdAt: Date) =>
    db.insert(inboundWebhooks).values({
      projectId,
      name: slug,
      slug,
      schema: { version: 1, fields: [] } as never,
      signingSecretEnc: encryptSecret(
        'whsec_top_secret',
        process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
      ),
      createdAt,
    });

  const get = (key: string, qs = '') =>
    request(app.getHttpServer())
      .get(`/api/project/inbound-webhooks${qs}`)
      .set('X-API-Key', key);

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
    await add(mine.id, 'b-second', new Date('2026-02-01T00:00:00Z'));
    await add(mine.id, 'a-first', new Date('2026-01-01T00:00:00Z'));
    await add(other.id, 'foreign', new Date('2026-01-15T00:00:00Z'));
  });

  it('returns only the key project webhooks, oldest first, with no secret', async () => {
    const res = await get(mine.apiKey).expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.items.map((w: { slug: string }) => w.slug)).toEqual([
      'a-first',
      'b-second',
    ]);
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      'active',
      'createdAt',
      'id',
      'name',
      'schema',
      'slug',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|foreign/i);
  });

  it('pages with limit and offset while total stays the full count', async () => {
    const res = await get(mine.apiKey, '?limit=1&offset=1').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((w: { slug: string }) => w.slug)).toEqual([
      'b-second',
    ]);
  });

  it('answers 401 for a missing or invalid key', async () => {
    await request(app.getHttpServer())
      .get('/api/project/inbound-webhooks')
      .expect(401);
    await get('mcid_pk_test_nope.nope').expect(401);
  });
});
