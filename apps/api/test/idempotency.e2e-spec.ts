import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { projectIdempotencyKeys } from '../src/database/entities';
import { DiscordService } from '../src/modules/discord/discord.service';
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
import { disableNock, enableNock } from './helpers/discord-mock';

const DB_URL = process.env.DATABASE_URL;
const describeIf = DB_URL ? describe : describe.skip;

describeIf('Project API Idempotency & Write Scopes (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let serverId: string;
  let adminBearerToken: string;
  let projectWithScope: ProjectFixture;
  let projectSecond: ProjectFixture;

  let getGuildByIdSpy: jest.SpyInstance;
  let rolesCreate: jest.Mock;

  beforeAll(async () => {
    enableNock();
    db = getTestDb();
    app = await createTestApp();
  });

  afterAll(async () => {
    disableNock();
    await closeTestDb();
    await app.close();
  });

  beforeEach(async () => {
    await clearAllTables(db);
    const adminCtx = await seedAdminContext(db);
    serverId = adminCtx.serverId;
    adminBearerToken = adminCtx.bearerToken;

    projectWithScope = await seedTestProject(db, serverId, {
      name: 'Event Platform Main',
      scopes: ['manage_roles', 'manage_channels', 'manage_events'],
    });

    projectSecond = await seedTestProject(db, serverId, {
      name: 'Second Event Project',
      scopes: ['manage_roles'],
    });

    let created = 0;
    rolesCreate = jest.fn().mockImplementation(async (opts) => {
      created += 1;
      await new Promise((r) => setTimeout(r, 60));
      return {
        id: `88800000000000000${created}`,
        name: opts.name,
        color: opts.color ?? 0,
        hoist: false,
        position: 10,
        managed: false,
        mentionable: opts.mentionable ?? false,
      };
    });

    getGuildByIdSpy = jest
      .spyOn(DiscordService.prototype, 'getGuildById')
      .mockImplementation((id: string) => {
        if (id !== serverId) return Promise.resolve(null);
        return Promise.resolve({
          id: serverId,
          roles: {
            cache: new Map([['bot-role', { position: 50 }]]),
            create: rolesCreate,
          },
          members: {
            me: {
              roles: {
                highest: { position: 50 },
              },
            },
          },
        } as any);
      });
  });

  afterEach(() => {
    getGuildByIdSpy?.mockRestore();
  });

  describe('Header validation', () => {
    it('returns 400 Bad Request when Idempotency-Key exceeds 128 characters', async () => {
      const longKey = 'k'.repeat(129);
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', longKey)
        .send({ name: 'Speaker' })
        .expect(400);

      expect(res.body.message).toContain('128 characters');
    });

    it('returns 400 Bad Request when Idempotency-Key is empty or whitespace', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', '   ')
        .send({ name: 'Speaker' })
        .expect(400);

      expect(res.body.message).toContain('empty');
    });
  });

  describe('Replay protection and caching', () => {
    it('executes the handler on first call and replays cached response on second identical call', async () => {
      const idempotencyKey = 'key-speaker-role-001';
      const payload = {
        name: 'Speaker Role',
        color: 0x123456,
        mentionable: true,
      };

      // Call 1: initial execution
      const res1 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);

      expect(res1.headers['idempotent-replayed']).toBeUndefined();
      expect(res1.body).toMatchObject({
        name: 'Speaker Role',
        color: 0x123456,
        mentionable: true,
      });
      expect(rolesCreate).toHaveBeenCalledTimes(1);

      // Verify stored row in database
      const [savedKey] = await db
        .select()
        .from(projectIdempotencyKeys)
        .where(eq(projectIdempotencyKeys.key, idempotencyKey));

      expect(savedKey).toBeDefined();
      expect(savedKey.status).toBe('completed');
      expect(savedKey.responseStatus).toBe(201);
      expect(savedKey.responseBody).toEqual(res1.body);

      // Call 2: repeated call with identical key and payload
      const res2 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);

      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body).toEqual(res1.body);
      // Discord create must NOT have been called a second time
      expect(rolesCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 409 Conflict when the same key is reused with a different request payload', async () => {
      const idempotencyKey = 'key-speaker-role-002';

      // First call
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'First Name' })
        .expect(201);

      // Second call with different payload
      const conflictRes = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'Different Name' })
        .expect(409);

      expect(conflictRes.body.message).toContain(
        'Idempotency key reused with different request payload',
      );
      expect(rolesCreate).toHaveBeenCalledTimes(1);
    });

    it('returns 409 Conflict for concurrent requests with the same key without running twice', async () => {
      const idempotencyKey = 'key-concurrent-003';
      const payload = { name: 'Concurrent Role' };

      const [req1, req2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/servers/${serverId}/roles`)
          .set('X-API-Key', projectWithScope.apiKey)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
        request(app.getHttpServer())
          .post(`/api/servers/${serverId}/roles`)
          .set('X-API-Key', projectWithScope.apiKey)
          .set('Idempotency-Key', idempotencyKey)
          .send(payload),
      ]);

      const statuses = [req1.status, req2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const conflictResponse = req1.status === 409 ? req1 : req2;
      expect(conflictResponse.body.message).toContain('already in progress');
      expect(rolesCreate).toHaveBeenCalledTimes(1);
    });

    it('scopes idempotency keys per project so two projects can use the same key', async () => {
      const sharedKey = 'shared-key-common';

      const res1 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', sharedKey)
        .send({ name: 'Project 1 Role' })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectSecond.apiKey)
        .set('Idempotency-Key', sharedKey)
        .send({ name: 'Project 2 Role' })
        .expect(201);

      expect(res1.headers['idempotent-replayed']).toBeUndefined();
      expect(res2.headers['idempotent-replayed']).toBeUndefined();
      expect(rolesCreate).toHaveBeenCalledTimes(2);
    });

    it('clears reservation on handler failure so the client can retry with the same key', async () => {
      const idempotencyKey = 'retryable-failed-key';

      // First call fails validation (empty name)
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: '' })
        .expect(400);

      // Verify no lingering in_progress lock in DB
      const [savedKey] = await db
        .select()
        .from(projectIdempotencyKeys)
        .where(eq(projectIdempotencyKeys.key, idempotencyKey));
      expect(savedKey).toBeUndefined();

      // Retry with valid body succeeds
      const retryRes = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'Valid Role After Retry' })
        .expect(201);

      expect(retryRes.body.name).toBe('Valid Role After Retry');
    });

    it('takes over a key left in_progress by a request that died', async () => {
      const idempotencyKey = 'stale-in-progress-key';
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await db.insert(projectIdempotencyKeys).values({
        projectId: projectWithScope.id,
        key: idempotencyKey,
        requestHash: 'from-a-dead-request',
        status: 'in_progress',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: tenMinutesAgo,
        updatedAt: tenMinutesAgo,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'Recovered Role' })
        .expect(201);

      expect(res.body.name).toBe('Recovered Role');
      expect(rolesCreate).toHaveBeenCalledTimes(1);
      const [savedKey] = await db
        .select()
        .from(projectIdempotencyKeys)
        .where(eq(projectIdempotencyKeys.key, idempotencyKey));
      expect(savedKey.status).toBe('completed');
    });

    it('still answers 409 for a recent in_progress key', async () => {
      const idempotencyKey = 'fresh-in-progress-key';
      await db.insert(projectIdempotencyKeys).values({
        projectId: projectWithScope.id,
        key: idempotencyKey,
        requestHash: 'from-a-running-request',
        status: 'in_progress',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/roles`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({ name: 'Must Not Run' })
        .expect(409);
      expect(rolesCreate).not.toHaveBeenCalled();
    });
  });

  describe('Discord write scopes (manage_channels & manage_events)', () => {
    it('accepts and persists manage_channels and manage_events via admin API', async () => {
      // Create project with new write scopes via admin API
      const createRes = await request(app.getHttpServer())
        .post('/api/admin/projects')
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .send({
          name: 'Discord Automation Suite',
          serverAccess: [
            {
              serverId,
              scopes: ['read_members', 'manage_channels', 'manage_events'],
            },
          ],
        })
        .expect(201);

      const createdProjectId = createRes.body.project.id;

      // Verify scopes via GET /api/admin/projects/:id/servers
      const getRes = await request(app.getHttpServer())
        .get(`/api/admin/projects/${createdProjectId}/servers`)
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .expect(200);

      const serverAccess = getRes.body.find(
        (s: any) => s.serverId === serverId,
      );
      expect(serverAccess).toBeDefined();
      expect(serverAccess.scopes).toEqual(
        expect.arrayContaining([
          'read_members',
          'manage_channels',
          'manage_events',
        ]),
      );
    });
  });
});
