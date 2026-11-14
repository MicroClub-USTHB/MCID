import { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import {
  auditLogs,
  members,
  projectCreatedRoles,
  roles,
  serverMemberRoles,
  serverMembers,
} from '../src/database/entities';
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

describeIf(
  '/api/servers/:serverId/roles & members/:discordId/roles (e2e)',
  () => {
    let app: INestApplication;
    let db: TestDb;
    let serverId: string;
    let execRoleId: string;
    let projectWithScope: ProjectFixture;
    let projectWithoutScope: ProjectFixture;

    const MEMBER_ID = '800000000000000002';
    let getGuildByIdSpy: jest.SpyInstance;
    let addRoleSpy: jest.SpyInstance;
    let removeRoleSpy: jest.SpyInstance;

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
      execRoleId = adminCtx.roleId;

      // Seed test member (separate from admin)
      await db.insert(members).values({
        id: MEMBER_ID,
        username: 'event_attendee',
        joinedAt: new Date(),
      });
      await db.insert(serverMembers).values({
        serverId,
        memberId: MEMBER_ID,
        joinedAt: new Date(),
      });

      // Project with manage_roles scope
      projectWithScope = await seedTestProject(db, serverId, {
        name: 'Event Platform Project',
        scopes: ['manage_roles'],
      });

      // Project without manage_roles scope
      projectWithoutScope = await seedTestProject(db, serverId, {
        name: 'Plain Project',
        scopes: ['read_members'],
      });

      // Spy Discord methods
      getGuildByIdSpy = jest
        .spyOn(DiscordService.prototype, 'getGuildById')
        .mockImplementation((id: string) => {
          if (id !== serverId) return Promise.resolve(null);
          return Promise.resolve({
            id: serverId,
            roles: {
              cache: new Map([
                ['bot-role', { position: 50 }],
                [execRoleId, { position: 100 }],
              ]),
              create: jest.fn().mockImplementation((opts) =>
                Promise.resolve({
                  id: '777000000000000001',
                  name: opts.name,
                  color: opts.color ?? 0,
                  hoist: false,
                  position: 10,
                  managed: false,
                  mentionable: opts.mentionable ?? false,
                }),
              ),
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

      addRoleSpy = jest
        .spyOn(DiscordService.prototype, 'addRoleToMember')
        .mockResolvedValue(true);

      removeRoleSpy = jest
        .spyOn(DiscordService.prototype, 'removeRoleFromMember')
        .mockResolvedValue(true);
    });

    afterEach(() => {
      getGuildByIdSpy?.mockRestore();
      addRoleSpy?.mockRestore();
      removeRoleSpy?.mockRestore();
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

    describe('POST /api/servers/:serverId/roles', () => {
      it('returns 401 when API key is missing', async () => {
        await request(app.getHttpServer())
          .post(`/api/servers/${serverId}/roles`)
          .send({ name: 'Hackathon Staff' })
          .expect(401);
      });

      it('returns 403 when project lacks manage_roles scope', async () => {
        await request(app.getHttpServer())
          .post(`/api/servers/${serverId}/roles`)
          .set('X-API-Key', projectWithoutScope.apiKey)
          .send({ name: 'Hackathon Staff' })
          .expect(403);
      });

      it('creates role with 0 permissions, saves to DB, and records ownership', async () => {
        const res = await request(app.getHttpServer())
          .post(`/api/servers/${serverId}/roles`)
          .set('X-API-Key', projectWithScope.apiKey)
          .send({
            name: 'Hackathon Staff',
            color: 0x3498db,
            mentionable: true,
          })
          .expect(201);

        expect(res.body.id).toBe('777000000000000001');
        expect(res.body.name).toBe('Hackathon Staff');
        expect(res.body.color).toBe(0x3498db);
        expect(res.body.mentionable).toBe(true);

        // Verify DB role row has permissionsBits: 0n
        const [roleRow] = await db
          .select()
          .from(roles)
          .where(eq(roles.id, '777000000000000001'));
        expect(roleRow).toBeDefined();
        expect(roleRow.permissionsBits).toBe(0n);

        // Verify ownership in project_created_roles
        const [ownership] = await db
          .select()
          .from(projectCreatedRoles)
          .where(
            and(
              eq(projectCreatedRoles.projectId, projectWithScope.id),
              eq(projectCreatedRoles.roleId, '777000000000000001'),
            ),
          );
        expect(ownership).toBeDefined();
        expect(ownership.serverId).toBe(serverId);
      });
    });

    describe('PUT /api/servers/:serverId/members/:discordId/roles/:roleId', () => {
      const CREATED_ROLE_ID = '777000000000000002';

      beforeEach(async () => {
        // Seed a role created by projectWithScope
        await db.insert(roles).values({
          id: CREATED_ROLE_ID,
          serverId,
          name: 'Event Volunteer',
          color: 0,
          position: 5,
          permissionsBits: 0n,
        });
        await db.insert(projectCreatedRoles).values({
          projectId: projectWithScope.id,
          roleId: CREATED_ROLE_ID,
          serverId,
        });
      });

      it('successfully grants role to member and repeat call is idempotent (204)', async () => {
        // First call
        await request(app.getHttpServer())
          .put(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${CREATED_ROLE_ID}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(204);

        expect(addRoleSpy).toHaveBeenCalledWith(
          serverId,
          MEMBER_ID,
          CREATED_ROLE_ID,
        );

        // Check DB entry in server_member_roles
        const [assigned] = await db
          .select()
          .from(serverMemberRoles)
          .where(
            and(
              eq(serverMemberRoles.memberId, MEMBER_ID),
              eq(serverMemberRoles.roleId, CREATED_ROLE_ID),
            ),
          );
        expect(assigned).toBeDefined();

        // Repeat call: should succeed with 204 (no-op)
        await request(app.getHttpServer())
          .put(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${CREATED_ROLE_ID}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(204);
      });

      it('returns 403 and writes an audit log when attempting to grant Executive role', async () => {
        await request(app.getHttpServer())
          .put(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${execRoleId}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(403);

        // Check audit log row in DB (logAction is fire-and-forget)
        const auditEntry = await waitForAuditLog(
          and(
            eq(auditLogs.actionType, 'access'),
            eq(auditLogs.action, 'role_escalation_attempt'),
          ),
        );

        expect(auditEntry).toBeDefined();
        expect(auditEntry?.severity).toBe('warning');
        expect(auditEntry?.entityId).toBe(execRoleId);
      });

      it('returns 403 and writes an audit log when attempting to grant role not created by project', async () => {
        const UNOWNED_ROLE_ID = '777000000000000099';
        await db.insert(roles).values({
          id: UNOWNED_ROLE_ID,
          serverId,
          name: 'Unowned Role',
          position: 2,
        });

        await request(app.getHttpServer())
          .put(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${UNOWNED_ROLE_ID}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(403);

        const auditEntry = await waitForAuditLog(
          and(
            eq(auditLogs.actionType, 'access'),
            eq(auditLogs.action, 'role_escalation_attempt'),
          ),
        );

        expect(auditEntry).toBeDefined();
        expect(auditEntry?.entityId).toBe(UNOWNED_ROLE_ID);
      });
    });

    describe('DELETE /api/servers/:serverId/members/:discordId/roles/:roleId', () => {
      const CREATED_ROLE_ID = '777000000000000003';

      beforeEach(async () => {
        await db.insert(roles).values({
          id: CREATED_ROLE_ID,
          serverId,
          name: 'Temporary Staff',
          color: 0,
          position: 5,
          permissionsBits: 0n,
        });
        await db.insert(projectCreatedRoles).values({
          projectId: projectWithScope.id,
          roleId: CREATED_ROLE_ID,
          serverId,
        });
        await db.insert(serverMemberRoles).values({
          memberId: MEMBER_ID,
          roleId: CREATED_ROLE_ID,
        });
      });

      it('successfully removes role and repeat call is idempotent (204)', async () => {
        // First delete
        await request(app.getHttpServer())
          .delete(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${CREATED_ROLE_ID}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(204);

        expect(removeRoleSpy).toHaveBeenCalledWith(
          serverId,
          MEMBER_ID,
          CREATED_ROLE_ID,
        );

        const [assigned] = await db
          .select()
          .from(serverMemberRoles)
          .where(
            and(
              eq(serverMemberRoles.memberId, MEMBER_ID),
              eq(serverMemberRoles.roleId, CREATED_ROLE_ID),
            ),
          );
        expect(assigned).toBeUndefined();

        // Repeat delete
        await request(app.getHttpServer())
          .delete(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${CREATED_ROLE_ID}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(204);
      });

      it('returns 403 and writes an audit log when attempting to remove Executive role', async () => {
        await request(app.getHttpServer())
          .delete(
            `/api/servers/${serverId}/members/${MEMBER_ID}/roles/${execRoleId}`,
          )
          .set('X-API-Key', projectWithScope.apiKey)
          .expect(403);

        const auditEntry = await waitForAuditLog(
          and(
            eq(auditLogs.actionType, 'access'),
            eq(auditLogs.action, 'role_escalation_attempt'),
          ),
        );

        expect(auditEntry).toBeDefined();
        expect(auditEntry?.entityId).toBe(execRoleId);
      });
    });
  },
);
