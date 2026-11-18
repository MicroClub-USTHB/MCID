import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { encryptSecret } from '../src/common/utils/encryption.util';
import { signPayload } from '../src/common/utils/inbound-webhook-signature.util';
import {
  inboundWebhookFiles,
  inboundWebhookSubmissions,
  inboundWebhooks,
} from '../src/database/entities';
import { InboundWebhookFilesService } from '../src/modules/inbound-webhooks/files/inbound-webhook-files.service';
import { InboundWebhooksRepository } from '../src/modules/inbound-webhooks/inbound-webhooks.repository';
import { STORAGE_ADAPTER } from '../src/modules/inbound-webhooks/files/storage.adapter';
import { createTestApp } from './helpers/create-app';
import { MemoryStorage } from './helpers/memory-storage';
import {
  clearAllTables,
  closeTestDb,
  getTestDb,
  ProjectFixture,
  seedAdminContext,
  seedTestProject,
  TestDb,
} from './helpers/db';

// file-type is ESM-only, which Jest's CommonJS runtime cannot load. The fake
// reads the same magic bytes; the real library is checked against compiled
// output, not here.
jest.mock('../src/modules/inbound-webhooks/files/mime-sniffer', () => ({
  sniffMime: (path: string) => {
    const head = jest.requireActual('fs').readFileSync(path);
    if (head.subarray(0, 4).toString('latin1') === '%PDF') {
      return Promise.resolve('application/pdf');
    }
    if (head.subarray(1, 4).toString('latin1') === 'ELF') {
      return Promise.resolve('application/x-elf');
    }
    return Promise.resolve(undefined);
  },
}));

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

const SIGNING_SECRET = 'whsec_test';
const MAX_BYTES = 2048;

const CV_SCHEMA = {
  version: 1 as const,
  fields: [
    { key: 'name', type: 'string' as const, required: true },
    {
      key: 'cv',
      type: 'file' as const,
      required: true,
      accept: ['application/pdf'],
      maxSizeBytes: MAX_BYTES,
    },
  ],
};

const PDF = Buffer.from('%PDF-1.7\nhello\n');
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0]);

describeIf('inbound webhook file uploads (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let project: ProjectFixture;
  let storage: MemoryStorage;
  let webhookId: string;
  let serverId: string;

  async function addWebhook(
    schema: object,
    overrides: Partial<typeof inboundWebhooks.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(inboundWebhooks)
      .values({
        projectId: project.id,
        name: 'Files',
        slug: `files-${Math.random().toString(36).slice(2, 8)}`,
        schema: schema as never,
        signingSecretEnc: encryptSecret(
          SIGNING_SECRET,
          process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
        ),
        requireSignature: false,
        ...overrides,
      })
      .returning({ id: inboundWebhooks.id });
    return row.id;
  }

  const base = (id = webhookId) => `/api/inbound-webhooks/${id}`;

  const upload = (
    content: Buffer,
    filename = 'cv.pdf',
    id = webhookId,
    contentType = 'application/pdf',
  ) =>
    request(app.getHttpServer())
      .post(`${base(id)}/files`)
      .set('X-API-Key', project.apiKey)
      .attach('file', content, { filename, contentType });

  const submit = (payload: object, id = webhookId) =>
    request(app.getHttpServer())
      .post(`${base(id)}/submit`)
      .set('X-API-Key', project.apiKey)
      .send(payload);

  beforeAll(async () => {
    db = getTestDb();
    storage = new MemoryStorage();
    app = await createTestApp((builder) =>
      builder.overrideProvider(STORAGE_ADAPTER).useValue(storage),
    );
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearAllTables(db);
    storage.objects.clear();
    storage.puts = 0;
    const admin = await seedAdminContext(db);
    serverId = admin.serverId;
    project = await seedTestProject(db, serverId);
    webhookId = await addWebhook(CV_SCHEMA);
  });

  it('uploads, submits and commits the file', async () => {
    const res = await upload(PDF).expect(201);
    expect(res.body).toMatchObject({
      fileId: expect.any(String),
      size: PDF.length,
      mime: 'application/pdf',
    });
    expect(res.body.sha256).toHaveLength(64);
    expect(storage.objects.get(`files/${res.body.sha256}`)).toEqual(PDF);

    const [pending] = await db.select().from(inboundWebhookFiles);
    expect(pending).toMatchObject({
      status: 'pending',
      submissionId: null,
      originalName: 'cv.pdf',
    });
    const hours = (new Date(res.body.expiresAt).getTime() - Date.now()) / 36e5;
    expect(hours).toBeGreaterThan(0.9);
    expect(hours).toBeLessThanOrEqual(1);

    const sub = await submit({
      name: 'Ada',
      cv: { fileId: res.body.fileId },
    }).expect(201);

    const [committed] = await db.select().from(inboundWebhookFiles);
    expect(committed).toMatchObject({
      status: 'committed',
      submissionId: sub.body.id,
    });
    const [stored] = await db
      .select()
      .from(inboundWebhookSubmissions)
      .where(eq(inboundWebhookSubmissions.id, sub.body.id));
    expect(stored.payload).toEqual({
      name: 'Ada',
      cv: { fileId: res.body.fileId },
    });
  });

  it('stores identical content once', async () => {
    const a = await upload(PDF).expect(201);
    const b = await upload(PDF, 'again.pdf').expect(201);
    expect(a.body.sha256).toBe(b.body.sha256);
    expect(a.body.fileId).not.toBe(b.body.fileId);
    expect(storage.puts).toBe(1);
    expect(await db.select().from(inboundWebhookFiles)).toHaveLength(2);
  });

  it('rejects an executable renamed to .pdf, even when it says application/pdf', async () => {
    const res = await upload(ELF, 'cv.pdf').expect(415);
    expect(res.body.message).toContain('application/x-elf');
    expect(storage.objects.size).toBe(0);
    expect(await db.select().from(inboundWebhookFiles)).toHaveLength(0);
  });

  it('rejects an oversize file while it streams', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_BYTES * 4, 1)]);
    await upload(big).expect(413);
    expect(storage.objects.size).toBe(0);
    expect(await db.select().from(inboundWebhookFiles)).toHaveLength(0);
  });

  it('rejects a body that is not multipart, and an upload with no file', async () => {
    await request(app.getHttpServer())
      .post(`${base()}/files`)
      .set('X-API-Key', project.apiKey)
      .send({ not: 'a file' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base()}/files`)
      .set('X-API-Key', project.apiKey)
      .field('note', 'no file here')
      .expect(400);
  });

  it('takes no upload for a webhook without file fields', async () => {
    const plain = await addWebhook({
      version: 1,
      fields: [{ key: 'name', type: 'string', required: true }],
    });
    await upload(PDF, 'cv.pdf', plain).expect(400);
  });

  it('refuses another project, and an unknown webhook', async () => {
    const other = await seedTestProject(db, serverId, {
      name: 'Other project',
    });
    await request(app.getHttpServer())
      .post(`${base()}/files`)
      .set('X-API-Key', other.apiKey)
      .attach('file', PDF, { filename: 'cv.pdf', contentType: 'text/plain' })
      .expect(404);
    await upload(PDF, 'cv.pdf', '00000000-0000-4000-8000-000000000000').expect(
      404,
    );
  });

  describe('at submit', () => {
    it('rejects a token from another webhook as if it did not exist', async () => {
      const other = await addWebhook(CV_SCHEMA);
      const { body } = await upload(PDF, 'cv.pdf', other).expect(201);
      const res = await submit({
        name: 'Ada',
        cv: { fileId: body.fileId },
      }).expect(422);
      expect(res.body.errors[0]).toMatchObject({
        path: 'cv',
        code: 'FILE_NOT_FOUND',
      });
    });

    it('rejects a token already used by a submission', async () => {
      const { body } = await upload(PDF).expect(201);
      await submit({ name: 'Ada', cv: { fileId: body.fileId } }).expect(201);
      const res = await submit({
        name: 'Bob',
        cv: { fileId: body.fileId },
      }).expect(422);
      expect(res.body.errors[0].code).toBe('FILE_ALREADY_USED');
    });

    it('rejects an expired token', async () => {
      const { body } = await upload(PDF).expect(201);
      await db
        .update(inboundWebhookFiles)
        .set({ expiresAt: new Date(Date.now() - 1000) });
      const res = await submit({
        name: 'Ada',
        cv: { fileId: body.fileId },
      }).expect(422);
      expect(res.body.errors[0].code).toBe('FILE_EXPIRED');
    });

    it('rejects a file the field does not accept', async () => {
      const strict = await addWebhook({
        version: 1,
        fields: [
          {
            key: 'pdf',
            type: 'file',
            accept: ['application/pdf'],
            maxSizeBytes: 100,
          },
          {
            key: 'png',
            type: 'file',
            accept: ['image/png'],
            maxSizeBytes: 100,
          },
        ],
      });
      const { body } = await upload(PDF, 'cv.pdf', strict).expect(201);
      const res = await submit(
        { pdf: { fileId: body.fileId }, png: { fileId: body.fileId } },
        strict,
      ).expect(422);
      expect(res.body.errors.map((e: { code: string }) => e.code)).toContain(
        'FILE_TYPE_NOT_ALLOWED',
      );
    });
  });

  it('sweeps uploads that were never submitted, and only those', async () => {
    const orphan = await upload(PDF).expect(201);
    const used = await upload(Buffer.from('%PDF-1.7\nother\n')).expect(201);
    await submit({ name: 'Ada', cv: { fileId: used.body.fileId } }).expect(201);

    await db
      .update(inboundWebhookFiles)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const swept = await app.get(InboundWebhookFilesService).sweepExpired();
    expect(swept).toBe(1);

    const rows = await db.select().from(inboundWebhookFiles);
    expect(rows.map((r) => r.id)).toEqual([used.body.fileId]);
    expect(storage.objects.has(`files/${orphan.body.sha256}`)).toBe(false);
    expect(storage.objects.has(`files/${used.body.sha256}`)).toBe(true);
  });

  it('keeps a shared object while another upload of the same bytes is alive', async () => {
    const a = await upload(PDF).expect(201);
    const b = await upload(PDF).expect(201);
    await db
      .update(inboundWebhookFiles)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(inboundWebhookFiles.id, a.body.fileId));

    await app.get(InboundWebhookFilesService).sweepExpired();

    expect(storage.objects.has(`files/${b.body.sha256}`)).toBe(true);
    const rows = await db.select().from(inboundWebhookFiles);
    expect(rows.map((r) => r.id)).toEqual([b.body.fileId]);
  });

  it('keeps a file saved in a draft step until the draft is submitted', async () => {
    const stepped = await addWebhook({
      version: 1,
      steps: [
        {
          key: 'identity',
          fields: [{ key: 'name', type: 'string', required: true }],
        },
        {
          key: 'docs',
          fields: [
            {
              key: 'cv',
              type: 'file',
              required: true,
              accept: ['application/pdf'],
              maxSizeBytes: MAX_BYTES,
            },
          ],
        },
      ],
    });
    const key = { 'X-API-Key': project.apiKey };
    const draft = await request(app.getHttpServer())
      .post(`${base(stepped)}/drafts`)
      .set(key)
      .expect(201);
    const { body: file } = await upload(PDF, 'cv.pdf', stepped).expect(201);

    await request(app.getHttpServer())
      .patch(`${base(stepped)}/drafts/${draft.body.draftId}/identity`)
      .set(key)
      .send({ name: 'Ada' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`${base(stepped)}/drafts/${draft.body.draftId}/docs`)
      .set(key)
      .send({ cv: { fileId: file.fileId } })
      .expect(200);

    // The upload window was one hour; the draft's is a day
    const [attached] = await db.select().from(inboundWebhookFiles);
    expect(attached.draftId).toBe(draft.body.draftId);
    expect(attached.expiresAt?.toISOString()).toBe(draft.body.expiresAt);

    expect(await app.get(InboundWebhookFilesService).sweepExpired()).toBe(0);

    await request(app.getHttpServer())
      .post(`${base(stepped)}/drafts/${draft.body.draftId}/submit`)
      .set(key)
      .expect(201);
    const [committed] = await db.select().from(inboundWebhookFiles);
    expect(committed.status).toBe('committed');
  });

  it('lets only one of two simultaneous submissions take a file', async () => {
    const { body } = await upload(PDF).expect(201);
    const results = await Promise.all(
      ['Ada', 'Bob'].map((name) =>
        submit({ name, cv: { fileId: body.fileId } }),
      ),
    );

    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    const loser = results.find((r) => r.status === 422)!;
    expect(loser.body.errors[0].code).toBe('FILE_ALREADY_USED');

    const winner = results.find((r) => r.status === 201)!;
    const [file] = await db.select().from(inboundWebhookFiles);
    expect(file.submissionId).toBe(winner.body.id);
    expect(await db.select().from(inboundWebhookSubmissions)).toHaveLength(1);
  });

  it('does not delete an object while an upload of the same bytes holds its lock', async () => {
    const { body } = await upload(PDF).expect(201);
    const key = `files/${body.sha256}`;
    await db
      .update(inboundWebhookFiles)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const repository = app.get(InboundWebhooksRepository);
    let sweep: Promise<number> | undefined;
    await repository.withStorageKeyLock(key, async (tx) => {
      // The sweep wants to delete the object, but the key is locked...
      sweep = app.get(InboundWebhookFilesService).sweepExpired();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(storage.objects.has(key)).toBe(true);

      // ...and an upload of the same bytes registers its row meanwhile
      await repository.insertFile(
        {
          webhookId,
          storageKey: key,
          sha256: body.sha256,
          sizeBytes: PDF.length,
          mime: 'application/pdf',
          originalName: 'again.pdf',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
        tx,
      );
    });
    await sweep;

    // Once the lock is released the sweep sees the new row and leaves the object
    expect(storage.objects.has(key)).toBe(true);
    const rows = await db.select().from(inboundWebhookFiles);
    expect(rows.map((r) => r.originalName)).toEqual(['again.pdf']);
  });

  describe('signature', () => {
    beforeEach(async () => {
      webhookId = await addWebhook(CV_SCHEMA, { requireSignature: true });
    });

    it('is checked over the empty string, because a multipart body is not signed', async () => {
      await upload(PDF).expect(401);
      await upload(PDF)
        .set('X-MCID-Signature', signPayload(SIGNING_SECRET, ''))
        .expect(201);
    });
  });
});
