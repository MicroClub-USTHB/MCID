import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { ChannelType } from 'discord.js';
import { auditLogs, projectScheduledEvents } from '../src/database/entities';
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

describeIf('/api/servers/:serverId/scheduled-events (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let serverId: string;
  let projectWithScope: ProjectFixture;
  let otherProjectWithScope: ProjectFixture;
  let projectWithoutScope: ProjectFixture;

  let getGuildByIdSpy: jest.SpyInstance;
  let getChannelByIdSpy: jest.SpyInstance;
  let createScheduledEventSpy: jest.SpyInstance;
  let getScheduledEventSpy: jest.SpyInstance;
  let editScheduledEventSpy: jest.SpyInstance;
  let deleteScheduledEventSpy: jest.SpyInstance;

  const mockEventsStore = new Map<string, any>();
  let eventCounter = 0;

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
    mockEventsStore.clear();
    eventCounter = 0;

    const adminCtx = await seedAdminContext(db);
    serverId = adminCtx.serverId;

    projectWithScope = await seedTestProject(db, serverId, {
      name: 'Event Platform Project',
      scopes: ['manage_events'],
    });

    otherProjectWithScope = await seedTestProject(db, serverId, {
      name: 'Other Project',
      scopes: ['manage_events'],
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
        if (channelId === '910000000000000010') {
          return Promise.resolve({
            id: channelId,
            guildId: serverId,
            type: ChannelType.GuildVoice,
            isDMBased: () => false,
          } as any);
        }
        if (channelId === '910000000000000099') {
          return Promise.resolve({
            id: channelId,
            guildId: '111111111111111111',
            type: ChannelType.GuildVoice,
            isDMBased: () => false,
          } as any);
        }
        return Promise.resolve(null);
      });

    createScheduledEventSpy = jest
      .spyOn(DiscordService.prototype, 'createScheduledEvent')
      .mockImplementation((_guildId: string, options: any) => {
        eventCounter += 1;
        const id = `92000000000000000${eventCounter}`;
        const mockEvt = {
          id,
          name: options.name,
          description: options.description ?? null,
          scheduledStartAt: new Date(options.scheduledStartTime),
          scheduledEndAt: options.scheduledEndTime
            ? new Date(options.scheduledEndTime)
            : null,
          entityMetadata: options.location
            ? { location: options.location }
            : null,
          channelId: options.channelId ?? null,
          status: 1, // SCHEDULED
          entityType: options.channelId ? 2 : 3, // VOICE or EXTERNAL
          delete: jest.fn().mockResolvedValue(undefined),
        };
        mockEventsStore.set(id, mockEvt);
        return Promise.resolve(mockEvt as any);
      });

    getScheduledEventSpy = jest
      .spyOn(DiscordService.prototype, 'getScheduledEvent')
      .mockImplementation((_guildId: string, eventId: string) => {
        const evt = mockEventsStore.get(eventId);
        return Promise.resolve(evt ?? null);
      });

    editScheduledEventSpy = jest
      .spyOn(DiscordService.prototype, 'editScheduledEvent')
      .mockImplementation((_guildId: string, eventId: string, options: any) => {
        const existing = mockEventsStore.get(eventId);
        if (!existing) return Promise.resolve(null);

        if (options.name !== undefined) existing.name = options.name;
        if (options.description !== undefined)
          existing.description = options.description;
        if (options.scheduledStartTime !== undefined)
          existing.scheduledStartAt = new Date(options.scheduledStartTime);
        if (options.scheduledEndTime !== undefined)
          existing.scheduledEndAt = new Date(options.scheduledEndTime);
        if (options.location !== undefined)
          existing.entityMetadata = { location: options.location };
        if (options.channelId !== undefined)
          existing.channelId = options.channelId;

        return Promise.resolve(existing);
      });

    deleteScheduledEventSpy = jest
      .spyOn(DiscordService.prototype, 'deleteScheduledEvent')
      .mockImplementation((_guildId: string, eventId: string) => {
        mockEventsStore.delete(eventId);
        return Promise.resolve(true);
      });
  });

  afterEach(() => {
    getGuildByIdSpy?.mockRestore();
    getChannelByIdSpy?.mockRestore();
    createScheduledEventSpy?.mockRestore();
    getScheduledEventSpy?.mockRestore();
    editScheduledEventSpy?.mockRestore();
    deleteScheduledEventSpy?.mockRestore();
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

  describe('Authentication & Scopes', () => {
    it('returns 401 when API key is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
          location: 'USTHB',
        })
        .expect(401);
    });

    it('returns 401 when API key is invalid', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', 'invalid.prefix.secret')
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
          location: 'USTHB',
        })
        .expect(401);
    });

    it('returns 403 when project lacks manage_events scope', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithoutScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
          location: 'USTHB',
        })
        .expect(403);
    });

    it('returns 403 when server is not accessible to the project', async () => {
      await request(app.getHttpServer())
        .post('/api/servers/999999999999999999/scheduled-events')
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
          location: 'USTHB',
        })
        .expect(403);
    });
  });

  describe('Validation', () => {
    it('returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
          location: 'USTHB',
        })
        .expect(400);
    });

    it('returns 400 when both location and channelId are missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
        })
        .expect(400);
    });

    it('returns 400 when both location and channelId are provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-06T18:00:00Z',
          location: 'USTHB',
          channelId: '910000000000000010',
        })
        .expect(400);
    });

    it('returns 400 when external location lacks endsAt', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          location: 'USTHB',
        })
        .expect(400);
    });

    it('returns 400 given an invalid time range (endsAt <= startsAt)', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          startsAt: '2026-12-05T09:00:00Z',
          endsAt: '2026-12-05T08:00:00Z',
          location: 'USTHB',
        })
        .expect(400);
    });
  });

  describe('POST /api/servers/:serverId/scheduled-events', () => {
    it('creates an external scheduled event with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Hackathon 2026',
          description: 'Annual hackathon',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-06T18:00:00.000Z',
          location: 'USTHB',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Hackathon 2026',
        description: 'Annual hackathon',
        location: 'USTHB',
        serverId,
        status: 'SCHEDULED',
        entityType: 'EXTERNAL',
      });
      expect(res.body.id).toBeDefined();

      // Verify row in project_scheduled_events table
      const [savedRow] = await db
        .select()
        .from(projectScheduledEvents)
        .where(eq(projectScheduledEvents.eventId, res.body.id));
      expect(savedRow).toBeDefined();
      expect(savedRow.projectId).toBe(projectWithScope.id);
      expect(savedRow.serverId).toBe(serverId);

      // Verify audit log
      const auditLog = await waitForAuditLog(
        eq(auditLogs.entityId, res.body.id),
      );
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('scheduled_event_created');
    });

    it('creates a voice channel scheduled event with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Opening Ceremony',
          startsAt: '2026-12-05T09:00:00.000Z',
          channelId: '910000000000000010',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Opening Ceremony',
        channelId: '910000000000000010',
        serverId,
        status: 'SCHEDULED',
        entityType: 'VOICE',
      });
    });

    it('returns 404 for a channel of another server', async () => {
      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Elsewhere',
          startsAt: '2026-12-05T09:00:00.000Z',
          channelId: '910000000000000099',
        })
        .expect(404);
      expect(createScheduledEventSpy).not.toHaveBeenCalledWith(
        serverId,
        expect.objectContaining({ name: 'Elsewhere' }),
      );
    });

    it('replays response idempotently with Idempotency-Key without creating duplicate Discord event', async () => {
      const idempotencyKey = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      const payload = {
        name: 'Workshop Web3',
        startsAt: '2026-12-05T14:00:00.000Z',
        endsAt: '2026-12-05T16:00:00.000Z',
        location: 'Lab 12',
      };

      const firstCallCount = createScheduledEventSpy.mock.calls.length;

      // First call
      const res1 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);

      expect(createScheduledEventSpy.mock.calls.length).toBe(
        firstCallCount + 1,
      );

      // Second call with same key
      const res2 = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);

      // Replayed cached response; Discord service was NOT called again
      expect(createScheduledEventSpy.mock.calls.length).toBe(
        firstCallCount + 1,
      );
      expect(res2.headers['idempotent-replayed']).toBe('true');
      expect(res2.body).toEqual(res1.body);
    });

    it('returns 409 when reusing Idempotency-Key with different payload', async () => {
      const idempotencyKey = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          name: 'First Event',
          startsAt: '2026-12-05T14:00:00.000Z',
          endsAt: '2026-12-05T16:00:00.000Z',
          location: 'Lab 1',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          name: 'Different Name',
          startsAt: '2026-12-05T14:00:00.000Z',
          endsAt: '2026-12-05T16:00:00.000Z',
          location: 'Lab 2',
        })
        .expect(409);
    });
  });

  describe('PATCH /api/servers/:serverId/scheduled-events/:eventId', () => {
    let ownedEventId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Initial Event',
          description: 'Initial Description',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-06T18:00:00.000Z',
          location: 'Initial Location',
        })
        .expect(201);

      ownedEventId = res.body.id;
    });

    it('updates own scheduled event with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/servers/${serverId}/scheduled-events/${ownedEventId}`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Renamed Event',
          location: 'New Location',
        })
        .expect(200);

      expect(res.body.name).toBe('Renamed Event');
      expect(res.body.location).toBe('New Location');

      const auditLog = await waitForAuditLog(
        eq(auditLogs.action, 'scheduled_event_updated'),
      );
      expect(auditLog).toBeDefined();
    });

    it('returns 404 when another project tries to update the event', async () => {
      await request(app.getHttpServer())
        .patch(`/api/servers/${serverId}/scheduled-events/${ownedEventId}`)
        .set('X-API-Key', otherProjectWithScope.apiKey)
        .send({
          name: 'Hijacked Event',
        })
        .expect(404);
    });

    it('returns 404 when updating non-existent event', async () => {
      await request(app.getHttpServer())
        .patch(`/api/servers/${serverId}/scheduled-events/999999999999999999`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Ghost Event',
        })
        .expect(404);
    });

    it('returns 400 when update results in invalid time range', async () => {
      await request(app.getHttpServer())
        .patch(`/api/servers/${serverId}/scheduled-events/${ownedEventId}`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          endsAt: '2026-12-04T00:00:00.000Z', // Before startsAt 2026-12-05
        })
        .expect(400);
    });
  });

  describe('DELETE /api/servers/:serverId/scheduled-events/:eventId', () => {
    let ownedEventId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/servers/${serverId}/scheduled-events`)
        .set('X-API-Key', projectWithScope.apiKey)
        .send({
          name: 'Event to Delete',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-06T18:00:00.000Z',
          location: 'USTHB',
        })
        .expect(201);

      ownedEventId = res.body.id;
    });

    it('returns 404 when another project tries to delete the event', async () => {
      await request(app.getHttpServer())
        .delete(`/api/servers/${serverId}/scheduled-events/${ownedEventId}`)
        .set('X-API-Key', otherProjectWithScope.apiKey)
        .expect(404);

      // Verify row still exists in DB
      const [savedRow] = await db
        .select()
        .from(projectScheduledEvents)
        .where(eq(projectScheduledEvents.eventId, ownedEventId));
      expect(savedRow).toBeDefined();
    });

    it('returns 404 when deleting a non-existent event', async () => {
      await request(app.getHttpServer())
        .delete(`/api/servers/${serverId}/scheduled-events/999999999999999999`)
        .set('X-API-Key', projectWithScope.apiKey)
        .expect(404);
    });

    it('deletes own scheduled event with 204 No Content', async () => {
      await request(app.getHttpServer())
        .delete(`/api/servers/${serverId}/scheduled-events/${ownedEventId}`)
        .set('X-API-Key', projectWithScope.apiKey)
        .expect(204);

      // Verify row removed from DB
      const [savedRow] = await db
        .select()
        .from(projectScheduledEvents)
        .where(eq(projectScheduledEvents.eventId, ownedEventId));
      expect(savedRow).toBeUndefined();

      // Verify audit log
      const auditLog = await waitForAuditLog(
        eq(auditLogs.action, 'scheduled_event_deleted'),
      );
      expect(auditLog).toBeDefined();
    });
  });
});
