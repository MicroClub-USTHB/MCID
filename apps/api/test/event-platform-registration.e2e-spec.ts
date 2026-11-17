/**
 * E2E: EP-12 — Event Platform Project Registration & Integration Flow
 *
 * Verifies the complete lifecycle of registering the Event Platform as an MCID project:
 * 1. Admin creates project "Event Platform" and receives the raw API key once.
 * 2. Admin whitelists the redirect URI.
 * 3. Admin grants server access with check_permissions and read_members scopes.
 * 4. Member performs SSO login with exact redirect URI matching and code-to-token exchange.
 * 5. Rejection of un-whitelisted redirect URIs (400 invalid_redirect_uri).
 * 6. Permission check API answers for the main server with the project API key.
 * 7. Server and scope isolation (403 on ungranted server or scope).
 * 8. Zero key leakage: raw API key is never exposed via admin endpoints or database storage.
 */
import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { createTestApp } from './helpers/create-app';
import {
  AdminContext,
  clearAllTables,
  closeTestDb,
  getTestDb,
  MemberFixture,
  seedAdminContext,
  seedMemberWithRole,
  TestDb,
} from './helpers/db';
import { disableNock, enableNock } from './helpers/discord-mock';
import { hashSsoToken } from '../src/common/utils/sso-token.util';
import {
  permissions,
  projects,
  rolePermissions,
  servers,
  ssoSessions,
} from '../src/database/entities';

const DB_URL = process.env.DATABASE_URL;
const describeIf = DB_URL ? describe : describe.skip;

const EVENT_PERMISSIONS_MIGRATION = readFileSync(
  join(__dirname, '../src/database/migrations/0011_event_permissions.sql'),
  'utf8',
);

describeIf('EP-12: Event Platform Registration & Integration (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let adminCtx: AdminContext;
  let member: MemberFixture;
  let otherServerId: string;

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
    // Ensure event permissions exist in the catalog
    await db.execute(sql.raw(EVENT_PERMISSIONS_MIGRATION));
    adminCtx = await seedAdminContext(db);
    member = await seedMemberWithRole(db, adminCtx.serverId);

    // Create a second server that the Event Platform is NOT granted access to
    otherServerId = '900000000000000099';
    await db.insert(servers).values({
      id: otherServerId,
      name: 'Unrelated Discord Server',
      isMain: false,
      type: 'official',
      isActive: true,
      syncFrequencyHours: 1,
      defaultPermissionPolicy: 'deny_all',
    });
  });

  const auth = () => `Bearer ${adminCtx.bearerToken}`;

  const seedSsoSession = async (memberId: string, rawToken: string) => {
    await db.insert(ssoSessions).values({
      memberId,
      tokenHash: hashSsoToken(rawToken),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
  };

  it('runs the full EP-12 operational registration, SSO flow, and permission checks', async () => {
    const callbackUri = 'https://events.microclub.info/api/auth/callback';

    // ── 1. Admin provisions the "Event Platform" project ─────────────────────
    const createRes = await request(app.getHttpServer())
      .post('/api/admin/projects')
      .set('Authorization', auth())
      .send({
        name: 'Event Platform',
        description: 'Micro Club Event Platform backend',
        isInternal: false,
      })
      .expect(201);

    expect(createRes.body.project.name).toBe('Event Platform');
    expect(createRes.body.apiKey).toBeDefined();
    expect(createRes.body.project.apiKeyPrefix).toBeDefined();
    expect(
      createRes.body.apiKey.startsWith(createRes.body.project.apiKeyPrefix),
    ).toBe(true);
    const projectId = createRes.body.project.id as string;
    const rawApiKey = createRes.body.apiKey as string;

    // ── 2. Admin whitelists the redirect URI ─────────────────────────────────
    const patchUriRes = await request(app.getHttpServer())
      .patch(`/api/admin/projects/${projectId}/redirect-uri`)
      .set('Authorization', auth())
      .send({ redirectUri: callbackUri })
      .expect(200);

    expect(patchUriRes.body.redirectUri).toBe(callbackUri);

    // ── 3. Admin grants server access with check_permissions & read_members ──
    const serverGrantRes = await request(app.getHttpServer())
      .put(`/api/admin/projects/${projectId}/servers/${adminCtx.serverId}`)
      .set('Authorization', auth())
      .send({
        scopes: ['check_permissions', 'read_members'],
      })
      .expect(200);

    expect(serverGrantRes.body.scopes).toEqual(
      expect.arrayContaining(['check_permissions', 'read_members']),
    );

    // ── 4. Verify no secret leakage via Admin GET endpoints ──────────────────
    const getProjectRes = await request(app.getHttpServer())
      .get(`/api/admin/projects/${projectId}`)
      .set('Authorization', auth())
      .expect(200);

    expect(getProjectRes.body.apiKey).toBeUndefined();
    expect(getProjectRes.body.apiKeyHash).toBeUndefined();
    expect(getProjectRes.body.apiKeyPrefix).toBe(
      createRes.body.project.apiKeyPrefix,
    );
    expect(getProjectRes.body.redirectUri).toBe(callbackUri);

    // Verify database stores hashed key and never plaintext
    const [dbProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(dbProject.apiKeyHash).toBeDefined();
    expect(dbProject.apiKeyHash).not.toBe(rawApiKey);

    // ── 5. Acceptance criteria: Reject un-whitelisted redirect URI ───────────
    const unwhitelistedRes = await request(app.getHttpServer())
      .get('/api/auth/sso/authorize')
      .query({
        client_id: projectId,
        redirect_uri: 'https://attacker.site/callback',
        server_id: adminCtx.serverId,
        state: 'csrf-tamper-check',
      })
      .expect(400);

    expect(unwhitelistedRes.body.error).toBe('invalid_redirect_uri');

    // ── 6. Acceptance criteria: Member SSO login & Token Exchange ────────────
    const ssoCookieToken = 'event-platform-sso-token-xyz';
    await seedSsoSession(member.id, ssoCookieToken);

    const ssoAuthorizeRes = await request(app.getHttpServer())
      .get('/api/auth/sso/authorize')
      .query({
        client_id: projectId,
        redirect_uri: callbackUri,
        server_id: adminCtx.serverId,
        state: 'csrf-state-valid-123',
      })
      .set('Cookie', [`mcid_sso=${ssoCookieToken}`])
      .expect(302);

    const redirectLocation = ssoAuthorizeRes.headers.location;
    expect(redirectLocation).toContain(callbackUri);
    expect(redirectLocation).toContain('state=csrf-state-valid-123');

    const parsedRedirectUrl = new URL(redirectLocation);
    const authCode = parsedRedirectUrl.searchParams.get('code');
    expect(authCode).toBeTruthy();

    // Event Platform exchanges code for a session token using its API key
    const exchangeRes = await request(app.getHttpServer())
      .post('/api/auth/token')
      .set('X-API-Key', rawApiKey)
      .send({
        clientId: projectId,
        code: authCode,
        redirectUri: callbackUri,
      })
      .expect(200);

    expect(exchangeRes.body.token).toBeDefined();
    expect(exchangeRes.body.member.id).toBe(member.id);

    // Code is single-use: replay must fail with 400 Bad Request
    const replayRes = await request(app.getHttpServer())
      .post('/api/auth/token')
      .set('X-API-Key', rawApiKey)
      .send({
        clientId: projectId,
        code: authCode,
        redirectUri: callbackUri,
      })
      .expect(400);

    expect(replayRes.body.message).toContain(
      'Invalid, used, or expired callback code',
    );

    // ── 7. Acceptance criteria: permissions/check answers for main server ─────
    // Grant EVENTS.CREATE to member's role
    const [createPerm] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, 'EVENTS.CREATE'));

    await db.insert(rolePermissions).values({
      roleId: member.roleId,
      permissionId: createPerm.id,
    });

    // Positive permission check
    const permCheckRes = await request(app.getHttpServer())
      .post('/api/permissions/check')
      .set('X-API-Key', rawApiKey)
      .send({
        discordId: member.id,
        serverId: adminCtx.serverId,
        permission: 'events.create',
      })
      .expect(200);

    expect(permCheckRes.body.allowed).toBe(true);

    // Negative permission check for unassigned permission
    const permCheckDeniedRes = await request(app.getHttpServer())
      .post('/api/permissions/check')
      .set('X-API-Key', rawApiKey)
      .send({
        discordId: member.id,
        serverId: adminCtx.serverId,
        permission: 'events.review',
      })
      .expect(200);

    expect(permCheckDeniedRes.body.allowed).toBe(false);

    // Batch permission check
    const batchCheckRes = await request(app.getHttpServer())
      .post('/api/permissions/check-batch')
      .set('X-API-Key', rawApiKey)
      .send({
        discordId: member.id,
        serverId: adminCtx.serverId,
        permissions: ['events.create', 'events.review'],
        mode: 'ANY',
      })
      .expect(200);

    expect(batchCheckRes.body.allowed).toBe(true);
    expect(batchCheckRes.body.matched).toContain('EVENTS.CREATE');

    // ── 8. Acceptance criteria: read_members scope allows fetching server member ─────
    const memberDetailRes = await request(app.getHttpServer())
      .get(`/api/servers/${adminCtx.serverId}/members/${member.id}`)
      .set('X-API-Key', rawApiKey)
      .expect(200);

    expect(memberDetailRes.body.discordId).toBe(member.id);
    expect(memberDetailRes.body.roles).toBeDefined();

    // ── 9. Server isolation: project cannot query ungranted servers ──────────
    const ungrantedServerRes = await request(app.getHttpServer())
      .post('/api/permissions/check')
      .set('X-API-Key', rawApiKey)
      .send({
        discordId: member.id,
        serverId: otherServerId,
        permission: 'events.create',
      })
      .expect(403);

    expect(ungrantedServerRes.body.message).toContain(
      'Project is not allowed to perform READ on server',
    );

    // Member read on ungranted server fails with 403
    await request(app.getHttpServer())
      .get(`/api/servers/${otherServerId}/members/${member.id}`)
      .set('X-API-Key', rawApiKey)
      .expect(403);

    // ── 10. Authentication security: invalid API key is rejected ──────────────
    await request(app.getHttpServer())
      .post('/api/permissions/check')
      .set('X-API-Key', 'mcid_proj_invalid_key_1234567890')
      .send({
        discordId: member.id,
        serverId: adminCtx.serverId,
        permission: 'events.create',
      })
      .expect(401);
  });
});
