import { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { auditLogs } from '../src/database/entities';
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

const CHANNEL_ID = '910000000000000010';
const FOREIGN_CHANNEL_ID = '910000000000000099';

describeIf(
  'POST /api/servers/:serverId/channels/:channelId/invites (e2e)',
  () => {
    let app: INestApplication;
    let db: TestDb;
    let serverId: string;
    let projectWithScope: ProjectFixture;
    let projectWithoutScope: ProjectFixture;
    let getChannelByIdSpy: jest.SpyInstance;
    let createInviteSpy: jest.SpyInstance;
    let inviteCounter = 0;

    const url = (channelId = CHANNEL_ID) =>
      `/api/servers/${serverId}/channels/${channelId}/invites`;

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
      inviteCounter = 0;
      serverId = (await seedAdminContext(db)).serverId;
      projectWithScope = await seedTestProject(db, serverId, {
        name: 'Event Platform Project',
        scopes: ['manage_channels'],
      });
      projectWithoutScope = await seedTestProject(db, serverId, {
        name: 'Plain Project',
        scopes: ['read_members'],
      });

      getChannelByIdSpy = jest
        .spyOn(DiscordService.prototype, 'getChannelById')
        .mockImplementation((channelId: string) => {
          const guildId =
            channelId === CHANNEL_ID
              ? serverId
              : channelId === FOREIGN_CHANNEL_ID
                ? '111111111111111111'
                : null;
          if (!guildId) return Promise.resolve(null);
          return Promise.resolve({
            id: channelId,
            guildId,
            isDMBased: () => false,
          } as never);
        });

      createInviteSpy = jest
        .spyOn(DiscordService.prototype, 'createChannelInvite')
        .mockImplementation(() => {
          inviteCounter += 1;
          const code = `code${inviteCounter}`;
          return Promise.resolve({
            code,
            url: `https://discord.gg/${code}`,
            expiresAt: new Date('2026-12-01T00:00:00.000Z'),
          } as never);
        });
    });

    afterEach(() => {
      getChannelByIdSpy?.mockRestore();
      createInviteSpy?.mockRestore();
    });

    it('returns 401 without an API key', async () => {
      await request(app.getHttpServer()).post(url()).send({}).expect(401);
    });

    it('returns 403 when the project lacks manage_channels', async () => {
      await request(app.getHttpServer())
        .post(url())
        .set('X-API-Key', projectWithoutScope.apiKey)
        .send({})
        .expect(403);
      expect(createInviteSpy).not.toHaveBeenCalled();
    });

    it('returns 403 for a server the project is not mapped to', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/999999999999999999/channels/${CHANNEL_ID}/invites`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({})
        .expect(403);
      expect(createInviteSpy).not.toHaveBeenCalled();
    });

    it('returns 404 for a channel in another server', async () => {
      await request(app.getHttpServer())
        .post(url(FOREIGN_CHANNEL_ID))
        .set('X-API-Key', projectWithScope.apiKey)
        .send({})
        .expect(404);
      expect(createInviteSpy).not.toHaveBeenCalled();
    });

    it('returns 400 for out-of-range options', async () => {
      await request(app.getHttpServer())
        .post(url())
        .set('X-API-Key', projectWithScope.apiKey)
        .send({ maxAgeSeconds: 604801 })
        .expect(400);
    });

    it('creates the invite once per idempotency key and audits it once', async () => {
      const send = () =>
        request(app.getHttpServer())
          .post(url())
          .set('X-API-Key', projectWithScope.apiKey)
          .set('Idempotency-Key', 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f')
          .send({ maxAgeSeconds: 604800, maxUses: 0 })
          .expect(201);

      const first = await send();
      const second = await send();

      expect(first.body).toEqual({
        code: 'code1',
        url: 'https://discord.gg/code1',
        expiresAt: '2026-12-01T00:00:00.000Z',
      });
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body).toEqual(first.body);
      expect(createInviteSpy).toHaveBeenCalledTimes(1);
      expect(createInviteSpy).toHaveBeenCalledWith(CHANNEL_ID, {
        maxAge: 604800,
        maxUses: 0,
        reason: `Created by project ${projectWithScope.id}`,
      });

      const where = and(
        eq(auditLogs.action, 'channel_invite_created'),
        eq(auditLogs.entityId, CHANNEL_ID),
      );
      let rows: (typeof auditLogs.$inferSelect)[] = [];
      for (let i = 0; i < 20 && rows.length === 0; i++) {
        rows = await db.select().from(auditLogs).where(where);
        if (rows.length === 0) await new Promise((r) => setTimeout(r, 50));
      }
      expect(rows).toHaveLength(1);
      expect(rows[0].details).toMatchObject({
        projectId: projectWithScope.id,
        serverId,
        code: 'code1',
      });
    });
  },
);
