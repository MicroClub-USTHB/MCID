import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import Discord, { ChannelType } from 'discord.js';
import { auditLogs, projectServers } from '../src/database/entities';
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

describeIf('Project Channels and Categories API (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let serverId: string;
  let projectWithScope: ProjectFixture;
  let projectWithoutScope: ProjectFixture;

  let getGuildByIdSpy: jest.SpyInstance;
  let getChannelByIdSpy: jest.SpyInstance;
  let createChannelSpy: jest.SpyInstance;

  let channelCounter = 0;
  const mockChannelsStore = new Map<string, any>();

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
    mockChannelsStore.clear();
    channelCounter = 0;

    const adminCtx = await seedAdminContext(db);
    serverId = adminCtx.serverId;

    projectWithScope = await seedTestProject(db, serverId, {
      name: 'Event Platform Project',
      scopes: ['manage_channels'],
    });

    projectWithoutScope = await seedTestProject(db, serverId, {
      name: 'Plain Project',
      scopes: ['read_members'],
    });

    getGuildByIdSpy = jest
      .spyOn(DiscordService.prototype, 'getGuildById')
      .mockImplementation((id: string) => {
        if (id !== serverId) return Promise.resolve(null);
        return Promise.resolve({ id: serverId } as any);
      });

    getChannelByIdSpy = jest
      .spyOn(DiscordService.prototype, 'getChannelById')
      .mockImplementation((channelId: string) => {
        if (mockChannelsStore.has(channelId)) {
          return Promise.resolve(mockChannelsStore.get(channelId));
        }
        if (channelId === '910000000000000001') {
          return Promise.resolve({
            id: channelId,
            name: 'existing-category',
            guildId: serverId,
            type: ChannelType.GuildCategory,
            isDMBased: () => false,
          } as any);
        }
        if (channelId === '910000000000000002') {
          return Promise.resolve({
            id: channelId,
            name: 'existing-text-channel',
            guildId: serverId,
            type: ChannelType.GuildText,
            isDMBased: () => false,
          } as any);
        }
        if (channelId === '910000000000000099') {
          return Promise.resolve({
            id: channelId,
            name: 'other-server-category',
            guildId: '111111111111111111',
            type: ChannelType.GuildCategory,
            isDMBased: () => false,
          } as any);
        }
        return Promise.resolve(null);
      });

    createChannelSpy = jest
      .spyOn(DiscordService.prototype, 'createChannel')
      .mockImplementation((guildId: string, name: string, options?: any) => {
        if (guildId !== serverId) return Promise.resolve(null);
        channelCounter += 1;
        const id = `93000000000000000${channelCounter}`;
        const mockChan = {
          id,
          name,
          type: options?.type ?? ChannelType.GuildText,
          parentId: options?.parent ?? null,
          guildId,
          isDMBased: () => false,
        };
        mockChannelsStore.set(id, mockChan);
        return Promise.resolve(mockChan as any);
      });
  });

  afterEach(() => {
    getGuildByIdSpy?.mockRestore?.();
    getChannelByIdSpy?.mockRestore?.();
    createChannelSpy?.mockRestore?.();
  });

  async function waitForAuditLog(
    whereClause: any,
    maxAttempts = 20,
  ): Promise<typeof auditLogs.$inferSelect | undefined> {
    for (let i = 0; i < maxAttempts; i++) {
      const [row] = await db.select().from(auditLogs).where(whereClause);
      if (row) return row;
      await new Promise((r) => setTimeout(r, 50));
    }
    return undefined;
  }

  // ── POST /api/servers/:serverId/categories ────────────────────────────────

  describe('POST /api/servers/:serverId/categories', () => {
    it('creates a category, records audit log, and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ name: 'Hackathon 2026' })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: 'Hackathon 2026',
      });

      const audit = await waitForAuditLog(eq(auditLogs.entityId, res.body.id));
      expect(audit).toBeDefined();
      expect(audit?.action).toBe('category_created');
      expect(audit?.actionType).toBe('server');
      expect(audit?.entityType).toBe('category');
    });

    it('supports idempotency replay with Idempotent-Replayed header', async () => {
      const key = 'cat-idem-key-1';
      const res1 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', key)
        .send({ name: 'Hackathon Category' })
        .expect(201);

      const callsBefore = createChannelSpy.mock.calls.length;

      const res2 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', key)
        .send({ name: 'Hackathon Category' })
        .expect(201);

      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body).toEqual(res1.body);
      expect(createChannelSpy.mock.calls.length).toBe(callsBefore);
    });

    it('returns 400 when name is empty or missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ name: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({})
        .expect(400);
    });
  });

  // ── POST /api/servers/:serverId/channels ──────────────────────────────────

  describe('POST /api/servers/:serverId/channels', () => {
    it('creates a text channel at root level and records audit log', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'announcements',
          type: 'text',
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: 'announcements',
        type: 'text',
        parentId: null,
      });

      const audit = await waitForAuditLog(eq(auditLogs.entityId, res.body.id));
      expect(audit).toBeDefined();
      expect(audit?.action).toBe('channel_created');
      expect(audit?.actionType).toBe('server');
      expect(audit?.entityType).toBe('channel');
    });

    it('creates a voice channel under a parent category', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'voice-room-1',
          type: 'voice',
          parentId: '910000000000000001',
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^\d+$/),
        name: 'voice-room-1',
        type: 'voice',
        parentId: '910000000000000001',
      });
    });

    it('supports idempotency replay with Idempotent-Replayed header', async () => {
      const key = 'chan-idem-key-1';
      const res1 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', key)
        .send({
          name: 'idempotent-chan',
          type: 'text',
        })
        .expect(201);

      const callsBefore = createChannelSpy.mock.calls.length;

      const res2 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', key)
        .send({
          name: 'idempotent-chan',
          type: 'text',
        })
        .expect(201);

      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body).toEqual(res1.body);
      expect(createChannelSpy.mock.calls.length).toBe(callsBefore);
    });

    it('returns 400 when name or type is invalid', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'test',
          type: 'invalid-type',
        })
        .expect(400);
    });

    it('returns 404 when parent category does not exist', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'subchannel',
          type: 'text',
          parentId: '999999999999999999',
        })
        .expect(404);
    });

    it('returns 404 when parent category belongs to a different server', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'subchannel',
          type: 'text',
          parentId: '910000000000000099',
        })
        .expect(404);
    });

    it('returns 400 when parent channel is not a category', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'subchannel',
          type: 'text',
          parentId: '910000000000000002',
        })
        .expect(400);
    });
  });

  // ── Scopes and Access Control ─────────────────────────────────────────────

  describe('Security and Scopes', () => {
    it('returns 401 when API key is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Category' })
        .expect(401);

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'channel', type: 'text' })
        .expect(401);
    });

    it('returns 403 when project lacks manage_channels scope', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithoutScope.apiKey)
        .send({ name: 'Category' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithoutScope.apiKey)
        .send({ name: 'channel', type: 'text' })
        .expect(403);
    });

    it('returns 404 when the project is not mapped to the server', async () => {
      await request(app.getHttpServer())
        .post('/api/servers/888888888888888888/categories')
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ name: 'Category' })
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/servers/888888888888888888/channels')
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ name: 'channel', type: 'text' })
        .expect(404);
    });

    it('returns 404 for a registered server the project is not mapped to', async () => {
      const otherProject = await seedTestProject(db, serverId, {
        name: 'Other Server Project',
        scopes: ['manage_channels'],
      });
      await db
        .delete(projectServers)
        .where(eq(projectServers.projectId, otherProject.id));

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('X-API-Key', otherProject.apiKey)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Category' })
        .expect(404);
    });

    it('returns 400 when the Idempotency-Key header is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/categories`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ name: 'Category' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ name: 'channel', type: 'text' })
        .expect(400);

      expect(createChannelSpy).not.toHaveBeenCalled();
    });
  });

  // ── Discord Error Mapping ─────────────────────────────────────────────────

  describe('Discord Error Mapping', () => {
    it('maps Discord MissingPermissions (50013 / 403) to 502 Bad Gateway', async () => {
      createChannelSpy.mockRejectedValueOnce(
        new Discord.DiscordAPIError(
          { code: 50013, message: 'Missing Permissions' },
          50013,
          403,
          'POST',
          `https://discord.com/api/v10/guilds/${serverId}/channels`,
          { files: undefined, body: undefined },
        ),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/channels`)
        .set('Idempotency-Key', randomUUID())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'blocked-chan',
          type: 'text',
        })
        .expect(502);

      expect(res.body.message).toContain(
        'Discord bot lacks permissions to manage channels',
      );
    });
  });
});
