/**
 * E2E: the six EVENTS.* permissions added by 0011_event_permissions.sql.
 *
 * Requires a running PostgreSQL database (`DATABASE_URL`).
 */
import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { and, eq, like, sql } from 'drizzle-orm';
import { createTestApp } from './helpers/create-app';
import {
  AdminContext,
  clearAllTables,
  closeTestDb,
  getTestDb,
  MemberFixture,
  seedAdminContext,
  seedMemberWithRole,
  seedTestProject,
  TestDb,
} from './helpers/db';
import { disableNock, enableNock } from './helpers/discord-mock';
import { permissions, rolePermissions } from '../src/database/entities';
import { ServersRepository } from '../src/modules/servers/servers.repository';

const DB_URL = process.env.DATABASE_URL;
const describeIf = DB_URL ? describe : describe.skip;

const MIGRATION = readFileSync(
  join(__dirname, '../src/database/migrations/0011_event_permissions.sql'),
  'utf8',
);
const EVENT_PERMISSIONS = [
  'events.create',
  'events.responses.read',
  'events.email.send',
  'events.review',
  'events.checkin',
  'events.templates.manage',
];

describeIf('EVENTS.* permissions (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let adminCtx: AdminContext;
  let apiKey: string;
  let member: MemberFixture;

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
    // Run the migration twice: it must stay idempotent.
    await db.execute(sql.raw(MIGRATION));
    await db.execute(sql.raw(MIGRATION));
    adminCtx = await seedAdminContext(db);
    apiKey = (
      await seedTestProject(db, adminCtx.serverId, {
        name: 'Event Platform',
        scopes: ['check_permissions'],
      })
    ).apiKey;
    member = await seedMemberWithRole(db, adminCtx.serverId);
  });

  async function grant(key: string) {
    const [perm] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, key));
    await db
      .insert(rolePermissions)
      .values({ roleId: member.roleId, permissionId: perm.id });
    return perm.id;
  }

  it('inserts each permission once when the migration runs twice', async () => {
    const rows = await db
      .select({ key: permissions.key })
      .from(permissions)
      .where(like(permissions.key, 'EVENTS.%'));
    expect(rows.map((r) => r.key).sort()).toEqual(
      EVENT_PERMISSIONS.map((p) => p.toUpperCase()).sort(),
    );
  });

  it('lists them in the admin permission catalog', async () => {
    await request(app.getHttpServer())
      .get('/api/permissions/catalog')
      .expect(401);

    const res = await request(app.getHttpServer())
      .get('/api/permissions/catalog')
      .set('Authorization', `Bearer ${adminCtx.bearerToken}`)
      .expect(200);
    const keys = (res.body as { key: string }[]).map((p) => p.key);
    for (const p of EVENT_PERMISSIONS) {
      expect(keys).toContain(p.toUpperCase());
    }
  });

  it('answers true for a held permission and false for the others', async () => {
    await grant('EVENTS.CHECKIN');

    for (const permission of EVENT_PERMISSIONS) {
      const res = await request(app.getHttpServer())
        .post('/api/permissions/check-batch')
        .set('X-API-Key', apiKey)
        .send({
          discordId: member.id,
          serverId: adminCtx.serverId,
          permissions: [permission],
          mode: 'ALL',
        })
        .expect(200);
      expect(res.body.allowed).toBe(permission === 'events.checkin');
    }
  });

  it('keeps an assigned event permission when Discord role sync runs', async () => {
    const permId = await grant('EVENTS.CHECKIN');

    await app.get(ServersRepository).syncRolePermissions(member.roleId, 0n);

    const rows = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, member.roleId),
          eq(rolePermissions.permissionId, permId),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
