/**
 * E2E test suite for EP-13:
 * Assign the event permissions to Discord roles, per environment.
 *
 * Verifies the admin role-permission assignment workflow, strict acceptance criteria
 * for Executive, HR, Reviewer, Staff, and non-event members via POST /api/permissions/check-batch,
 * error and security boundaries, and Discord sync persistence.
 */
import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './helpers/create-app';
import {
  AdminContext,
  clearAllTables,
  closeTestDb,
  getTestDb,
  seedAdminContext,
  seedTestProject,
  TestDb,
} from './helpers/db';
import { disableNock, enableNock } from './helpers/discord-mock';
import {
  members,
  permissions,
  rolePermissions,
  roles,
  serverMemberRoles,
  serverMembers,
} from '../src/database/entities';
import { ServersRepository } from '../src/modules/servers/servers.repository';

const DB_URL = process.env.DATABASE_URL;
const describeIf = DB_URL ? describe : describe.skip;

const MIGRATION = readFileSync(
  join(__dirname, '../src/database/migrations/0011_event_permissions.sql'),
  'utf8',
);

const ALL_EVENT_PERMISSIONS = [
  'events.create',
  'events.responses.read',
  'events.email.send',
  'events.review',
  'events.checkin',
  'events.templates.manage',
];

describeIf('EP-13: Event role permissions assignment (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let adminCtx: AdminContext;
  let apiKey: string;

  // Role IDs
  const executiveRoleId = '700000000000000001'; // from seedAdminContext
  const hrRoleId = '700000000000000002';
  const reviewerRoleId = '700000000000000003';
  const staffRoleId = '700000000000000004';
  const generalRoleId = '700000000000000005';

  // Member IDs
  const executiveMemberId = '800000000000000001'; // from seedAdminContext
  const hrMemberId = '800000000000000002';
  const reviewerMemberId = '800000000000000003';
  const staffMemberId = '800000000000000004';
  const generalMemberId = '800000000000000005';
  const unassignedMemberId = '800000000000000006';

  let permMap: Map<string, number>;

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
    // Ensure 0011_event_permissions.sql is applied
    await db.execute(sql.raw(MIGRATION));

    // 1. Seed root admin context (server + admin member + executive role)
    adminCtx = await seedAdminContext(db);

    // 2. Map uppercase permission keys to their serial IDs
    const permRows = await db
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(
        inArray(
          permissions.key,
          ALL_EVENT_PERMISSIONS.map((p) => p.toUpperCase()),
        ),
      );
    permMap = new Map(permRows.map((r) => [r.key, r.id]));

    // 3. Register Event Platform project with check_permissions scope
    const project = await seedTestProject(db, adminCtx.serverId, {
      name: 'Event Platform',
      scopes: ['check_permissions'],
    });
    apiKey = project.apiKey;

    // 4. Seed Discord roles on the main server
    await db.insert(roles).values([
      {
        id: hrRoleId,
        serverId: adminCtx.serverId,
        name: 'HR',
        color: 0x9b59b6,
        hoist: true,
        position: 4,
        managed: false,
        mentionable: true,
      },
      {
        id: reviewerRoleId,
        serverId: adminCtx.serverId,
        name: 'Reviewer',
        color: 0x1abc9c,
        hoist: false,
        position: 5,
        managed: false,
        mentionable: true,
      },
      {
        id: staffRoleId,
        serverId: adminCtx.serverId,
        name: 'Staff',
        color: 0xe67e22,
        hoist: false,
        position: 6,
        managed: false,
        mentionable: true,
      },
      {
        id: generalRoleId,
        serverId: adminCtx.serverId,
        name: 'General Member',
        color: 0x95a5a6,
        hoist: false,
        position: 7,
        managed: false,
        mentionable: false,
      },
    ]);

    // 5. Seed members
    const membersToInsert = [
      { id: hrMemberId, username: 'hr_member' },
      { id: reviewerMemberId, username: 'reviewer_member' },
      { id: staffMemberId, username: 'staff_member' },
      { id: generalMemberId, username: 'general_member' },
      { id: unassignedMemberId, username: 'unassigned_member' },
    ];

    for (const m of membersToInsert) {
      await db.insert(members).values({
        id: m.id,
        username: m.username,
        isClubMember: true,
        joinedAt: new Date(),
        syncedAt: new Date(),
      });
      await db.insert(serverMembers).values({
        serverId: adminCtx.serverId,
        memberId: m.id,
        joinedAt: new Date(),
      });
    }

    // 6. Assign roles to members
    await db.insert(serverMemberRoles).values([
      { memberId: hrMemberId, roleId: hrRoleId },
      { memberId: reviewerMemberId, roleId: reviewerRoleId },
      { memberId: staffMemberId, roleId: staffRoleId },
      { memberId: generalMemberId, roleId: generalRoleId },
    ]);
  });

  describe('1. Admin Role Permission Assignment Flow', () => {
    it('allows an admin to assign event permissions to Discord roles and retrieves them', async () => {
      // Assign all 6 permissions to Executive
      const execPermIds = ALL_EVENT_PERMISSIONS.map((p) =>
        permMap.get(p.toUpperCase())!,
      );
      const resExec = await request(app.getHttpServer())
        .post(
          `/api/permissions/admin/servers/${adminCtx.serverId}/roles/${executiveRoleId}/permissions`,
        )
        .set('Authorization', `Bearer ${adminCtx.bearerToken}`)
        .send({ permissionIds: execPermIds })
        .expect(200);

      expect(resExec.body.roleId).toBe(executiveRoleId);
      expect(resExec.body.permissions.length).toBeGreaterThanOrEqual(6);

      // Assign HR permissions: create, responses.read, email.send
      const hrPermIds = [
        permMap.get('EVENTS.CREATE')!,
        permMap.get('EVENTS.RESPONSES.READ')!,
        permMap.get('EVENTS.EMAIL.SEND')!,
      ];
      await request(app.getHttpServer())
        .post(
          `/api/permissions/admin/servers/${adminCtx.serverId}/roles/${hrRoleId}/permissions`,
        )
        .set('Authorization', `Bearer ${adminCtx.bearerToken}`)
        .send({ permissionIds: hrPermIds })
        .expect(200);

      // Assign Reviewer permissions: events.review
      const reviewerPermIds = [permMap.get('EVENTS.REVIEW')!];
      await request(app.getHttpServer())
        .post(
          `/api/permissions/admin/servers/${adminCtx.serverId}/roles/${reviewerRoleId}/permissions`,
        )
        .set('Authorization', `Bearer ${adminCtx.bearerToken}`)
        .send({ permissionIds: reviewerPermIds })
        .expect(200);

      // Assign Staff permissions: events.checkin
      const staffPermIds = [permMap.get('EVENTS.CHECKIN')!];
      await request(app.getHttpServer())
        .post(
          `/api/permissions/admin/servers/${adminCtx.serverId}/roles/${staffRoleId}/permissions`,
        )
        .set('Authorization', `Bearer ${adminCtx.bearerToken}`)
        .send({ permissionIds: staffPermIds })
        .expect(200);

      // Verify GET returns the assigned permissions
      const getStaffRes = await request(app.getHttpServer())
        .get(
          `/api/permissions/admin/servers/${adminCtx.serverId}/roles/${staffRoleId}/permissions`,
        )
        .set('Authorization', `Bearer ${adminCtx.bearerToken}`)
        .expect(200);

      expect(getStaffRes.body.roleId).toBe(staffRoleId);
      const staffKeys = getStaffRes.body.permissions.map((p: any) => p.key);
      expect(staffKeys).toContain('EVENTS.CHECKIN');
      expect(staffKeys).not.toContain('EVENTS.RESPONSES.READ');
    });
  });

  describe('2. Batch Permission Verification (POST /api/permissions/check-batch)', () => {
    beforeEach(async () => {
      // Assign the official matrix
      await db.insert(rolePermissions).values([
        // Executive: all six
        ...ALL_EVENT_PERMISSIONS.map((p) => ({
          roleId: executiveRoleId,
          permissionId: permMap.get(p.toUpperCase())!,
        })),
        // HR: create, responses.read, email.send
        { roleId: hrRoleId, permissionId: permMap.get('EVENTS.CREATE')! },
        {
          roleId: hrRoleId,
          permissionId: permMap.get('EVENTS.RESPONSES.READ')!,
        },
        { roleId: hrRoleId, permissionId: permMap.get('EVENTS.EMAIL.SEND')! },
        // Reviewer: review
        {
          roleId: reviewerRoleId,
          permissionId: permMap.get('EVENTS.REVIEW')!,
        },
        // Staff: checkin
        { roleId: staffRoleId, permissionId: permMap.get('EVENTS.CHECKIN')! },
      ]);
    });

    it('Staff role: events.checkin is true and events.responses.read is false', async () => {
      // Mode ALL with checkin only -> true
      const checkinOnly = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin'],
          mode: 'ALL',
        })
        .expect(200);
      expect(checkinOnly.body.allowed).toBe(true);
      expect(checkinOnly.body.missing).toEqual([]);

      // Mode ALL with checkin AND responses.read -> false (missing responses.read)
      const bothAll = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin', 'events.responses.read'],
          mode: 'ALL',
        })
        .expect(200);
      expect(bothAll.body.allowed).toBe(false);
      expect(bothAll.body.missing).toEqual(['EVENTS.RESPONSES.READ']);

      // Mode ANY with checkin AND responses.read -> true (matched checkin)
      const bothAny = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin', 'events.responses.read'],
          mode: 'ANY',
        })
        .expect(200);
      expect(bothAny.body.allowed).toBe(true);
      expect(bothAny.body.matched).toEqual(['EVENTS.CHECKIN']);
    });

    it('Executive role: all six permissions are true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: executiveMemberId,
          serverId: adminCtx.serverId,
          permissions: ALL_EVENT_PERMISSIONS,
          mode: 'ALL',
        })
        .expect(200);

      expect(res.body.allowed).toBe(true);
      expect(res.body.missing).toEqual([]);
    });

    it('HR role: create, responses.read and email.send are true, templates.manage and review are false', async () => {
      // Allowed operations
      const hrAllowed = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: hrMemberId,
          serverId: adminCtx.serverId,
          permissions: [
            'events.create',
            'events.responses.read',
            'events.email.send',
          ],
          mode: 'ALL',
        })
        .expect(200);
      expect(hrAllowed.body.allowed).toBe(true);
      expect(hrAllowed.body.missing).toEqual([]);

      // Restricted operations (templates.manage, review)
      const hrRestricted = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: hrMemberId,
          serverId: adminCtx.serverId,
          permissions: [
            'events.create',
            'events.templates.manage',
            'events.review',
          ],
          mode: 'ALL',
        })
        .expect(200);
      expect(hrRestricted.body.allowed).toBe(false);
      expect(hrRestricted.body.missing).toEqual([
        'EVENTS.TEMPLATES.MANAGE',
        'EVENTS.REVIEW',
      ]);
    });

    it('Reviewer role: events.review is true and checkin/create are false', async () => {
      const reviewerCheck = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: reviewerMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.review'],
          mode: 'ALL',
        })
        .expect(200);
      expect(reviewerCheck.body.allowed).toBe(true);

      const reviewerDisallowed = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: reviewerMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.review', 'events.checkin', 'events.create'],
          mode: 'ALL',
        })
        .expect(200);
      expect(reviewerDisallowed.body.allowed).toBe(false);
      expect(reviewerDisallowed.body.missing).toEqual([
        'EVENTS.CHECKIN',
        'EVENTS.CREATE',
      ]);
    });

    it('Member with no event role: mode ANY returns false with empty matched array', async () => {
      // General member (holds a role without event permissions)
      const generalRes = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: generalMemberId,
          serverId: adminCtx.serverId,
          permissions: ALL_EVENT_PERMISSIONS,
          mode: 'ANY',
        })
        .expect(200);
      expect(generalRes.body.allowed).toBe(false);
      expect(generalRes.body.matched).toEqual([]);

      // Member with no server roles at all
      const unassignedRes = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: unassignedMemberId,
          serverId: adminCtx.serverId,
          permissions: ALL_EVENT_PERMISSIONS,
          mode: 'ANY',
        })
        .expect(200);
      expect(unassignedRes.body.allowed).toBe(false);
      expect(unassignedRes.body.matched).toEqual([]);
    });
  });

  describe('3. Error Contracts and Guard Enforcement', () => {
    it('returns 401 when API key is missing or invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin'],
          mode: 'ANY',
        })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', 'invalid_key')
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin'],
          mode: 'ANY',
        })
        .expect(401);
    });

    it('returns 403 when project lacks check_permissions scope or access to server', async () => {
      const unprivilegedProject = await seedTestProject(db, adminCtx.serverId, {
        name: 'No Scope Project',
        scopes: [],
      });

      await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', unprivilegedProject.apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin'],
          mode: 'ANY',
        })
        .expect(403);
    });

    it('returns 400 when body payload is invalid', async () => {
      // Invalid mode
      await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin'],
          mode: 'INVALID_MODE',
        })
        .expect(400);

      // Missing permissions array
      await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          mode: 'ANY',
        })
        .expect(400);
    });
  });

  describe('4. Discord Role Sync Resilience', () => {
    it('preserves assigned event permissions when Discord role sync executes', async () => {
      // Assign checkin to Staff
      await db.insert(rolePermissions).values({
        roleId: staffRoleId,
        permissionId: permMap.get('EVENTS.CHECKIN')!,
      });

      // Simulate a Discord sync resetting Discord bitfields to 0
      await app.get(ServersRepository).syncRolePermissions(staffRoleId, 0n);

      // Verify EVENTS.CHECKIN is still assigned
      const assigned = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, staffRoleId));

      expect(assigned).toHaveLength(1);
      expect(assigned[0].permissionId).toBe(permMap.get('EVENTS.CHECKIN')!);

      // Verify check-batch still evaluates to true
      const res = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: staffMemberId,
          serverId: adminCtx.serverId,
          permissions: ['events.checkin'],
          mode: 'ALL',
        })
        .expect(200);

      expect(res.body.allowed).toBe(true);
    });
  });
});
