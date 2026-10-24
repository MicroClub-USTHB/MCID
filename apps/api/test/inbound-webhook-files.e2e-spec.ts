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
import { STORAGE_ADAPTER } from '../src/modules/inbound-webhooks/files/storage.adapter';
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

// file-type is ESM-only, which Jest's CommonJS runtime cannot load. The fake
// reads the same magic bytes; the real library is checked against compiled
// output, not here.
jest.mock('../src/modules/inbound-webhooks/files/mime-sniffer', () => ({
  sniffMime: (head: Buffer) => {
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

/** Objects by key: stands in for S3, so the suite needs no object store. */
class MemoryStorage {
  objects = new Map<string, Buffer>();
  puts = 0;

  exists(key: string) {
    return Promise.resolve(this.objects.has(key));
  }

  async put(key: string, body: AsyncIterable<Buffer>, size: number) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    expect(data.length).toBe(size);
    this.objects.set(key, data);
    this.puts += 1;
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

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
