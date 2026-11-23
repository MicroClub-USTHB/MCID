import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { encryptSecret } from '../src/common/utils/encryption.util';
import {
  inboundWebhooks,
  memberIdentities,
  members,
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

const STEPPED = {
  version: 1 as const,
  steps: [
    {
      key: 'profile',
      fields: [
        { key: 'discordId', type: 'string' as const, required: true },
        { key: 'github', type: 'string' as const, required: true },
      ],
    },
  ],
};

describeIf('member identities and webhook identity mapping (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let project: ProjectFixture;
  let webhookId: string;

  const seedMember = async (id: string) => {
    await db.insert(members).values({ id, username: `user-${id}` });
  };

  const submit = (profile: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/inbound-webhooks/${webhookId}/submit`)
      .set('X-API-Key', project.apiKey)
      .send({ profile });

  const identities = (provider = 'github', roleIds?: string) =>
    request(app.getHttpServer())
      .get('/api/identities')
      .query({ provider, ...(roleIds ? { roleIds } : {}) })
      .set('X-API-Key', project.apiKey);

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
    project = await seedTestProject(db, admin.serverId);
    const [row] = await db
      .insert(inboundWebhooks)
      .values({
        projectId: project.id,
        name: 'Dev usernames',
        slug: 'dev-usernames',
        schema: STEPPED,
        signingSecretEnc: encryptSecret(
          'whsec_test',
          process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
        ),
        requireSignature: false,
        identityMapping: {
          provider: 'github',
          memberIdField: 'profile.discordId',
          handleField: 'profile.github',
        },
      })
      .returning({ id: inboundWebhooks.id });
    webhookId = row.id;
    await seedMember('100000000000000001');
    await seedMember('100000000000000002');
  });

  it('links a normalised username to the member and stores the submission', async () => {
    await submit({
      discordId: '100000000000000001',
      github: '@Octo-Cat',
    }).expect(201);

    const rows = await db.select().from(memberIdentities);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberId: '100000000000000001',
      provider: 'github',
      handle: 'octo-cat',
      verifiedAt: null,
    });
  });

  it('replaces the username when the same member submits again', async () => {
    await submit({ discordId: '100000000000000001', github: 'first' }).expect(
      201,
    );
    await submit({ discordId: '100000000000000001', github: 'second' }).expect(
      201,
    );

    const rows = await db.select().from(memberIdentities);
    expect(rows).toHaveLength(1);
    expect(rows[0].handle).toBe('second');
  });

  it('refuses an account already linked to another member, storing nothing', async () => {
    await submit({ discordId: '100000000000000001', github: 'octo' }).expect(
      201,
    );
    await submit({ discordId: '100000000000000002', github: 'octo' }).expect(
      409,
    );

    const rows = await db.select().from(memberIdentities);
    expect(rows.map((r) => r.memberId)).toEqual(['100000000000000001']);
  });

  it('refuses an unknown member and an invalid username', async () => {
    await submit({ discordId: '999999999999999999', github: 'octo' }).expect(
      404,
    );
    await submit({
      discordId: '100000000000000001',
      github: 'no good!',
    }).expect(400);
    expect(await db.select().from(memberIdentities)).toHaveLength(0);
  });

  it('links on a draft submit too, and refuses a conflict there', async () => {
    const api = (method: 'post' | 'patch', url: string) =>
      request(app.getHttpServer())
        [method](`/api/inbound-webhooks/${webhookId}${url}`)
        .set('X-API-Key', project.apiKey);

    const runDraft = async (discordId: string, github: string) => {
      const { body } = await api('post', '/drafts').expect(201);
      await api('patch', `/drafts/${body.draftId}/profile`)
        .send({ discordId, github })
        .expect(200);
      return api('post', `/drafts/${body.draftId}/submit`);
    };

    expect((await runDraft('100000000000000001', 'draft-user')).status).toBe(
      201,
    );
    expect((await db.select().from(memberIdentities))[0].handle).toBe(
      'draft-user',
    );

    expect((await runDraft('100000000000000002', 'draft-user')).status).toBe(
      409,
    );
    expect(await db.select().from(memberIdentities)).toHaveLength(1);
  });

  it('does nothing when the webhook has no mapping', async () => {
    await db
      .update(inboundWebhooks)
      .set({ identityMapping: null })
      .where(eq(inboundWebhooks.id, webhookId));

    await submit({ discordId: '100000000000000001', github: 'octo' }).expect(
      201,
    );
    expect(await db.select().from(memberIdentities)).toHaveLength(0);
  });

  it('lists linked accounts through the API key', async () => {
    await submit({ discordId: '100000000000000001', github: 'octo' }).expect(
      201,
    );

    const res = await identities().expect(200);
    expect(res.body).toEqual({
      provider: 'github',
      count: 1,
      identities: [
        { memberId: '100000000000000001', handle: 'octo', verified: false },
      ],
    });
  });

  it('rejects an unknown provider, a bad role id and a missing key', async () => {
    await identities('myspace').expect(400);
    await identities('github', 'not-a-role').expect(400);
    await request(app.getHttpServer())
      .get('/api/identities')
      .query({ provider: 'github' })
      .expect(401);
  });

  it('returns nobody for a role no linked member holds', async () => {
    await submit({ discordId: '100000000000000001', github: 'octo' }).expect(
      201,
    );

    const res = await identities('github', '700000000000000099').expect(200);
    expect(res.body.count).toBe(0);
  });
});
