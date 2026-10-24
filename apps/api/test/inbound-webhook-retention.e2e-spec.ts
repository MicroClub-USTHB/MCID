import { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { encryptSecret } from '../src/common/utils/encryption.util';
import {
  inboundWebhookDrafts,
  inboundWebhookFiles,
  inboundWebhookSubmissions,
  inboundWebhooks,
} from '../src/database/entities';
import { STORAGE_ADAPTER } from '../src/modules/inbound-webhooks/files/storage.adapter';
import { InboundWebhookRetentionService } from '../src/modules/inbound-webhooks/retention/inbound-webhook-retention.service';
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
import { MemoryStorage } from './helpers/memory-storage';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describeIf('inbound webhook retention (e2e)', () => {
  let app: INestApplication;
  let db: TestDb;
  let project: ProjectFixture;
  let storage: MemoryStorage;
  let webhookId: string;
  let retention: InboundWebhookRetentionService;

  const addDraft = async (
    status: 'open' | 'expired' | 'submitted',
    expiresAt: Date,
  ) => {
    const [row] = await db
      .insert(inboundWebhookDrafts)
      .values({ webhookId, projectId: project.id, status, expiresAt })
      .returning({ id: inboundWebhookDrafts.id });
    return row.id;
  };

  /** A submission with one committed file stored under `key`. */
  const addSubmission = async (
    receivedAt: Date,
    key?: string,
    draftId?: string,
  ) => {
    const [row] = await db
      .insert(inboundWebhookSubmissions)
      .values({
        webhookId,
        projectId: project.id,
        draftId: draftId ?? null,
        payload: { name: 'Ada' },
        receivedAt,
      })
      .returning({ id: inboundWebhookSubmissions.id });
    if (key) {
      storage.objects.set(key, Buffer.from('x'));
      await db.insert(inboundWebhookFiles).values({
        webhookId,
        submissionId: row.id,
        storageKey: key,
        sha256: key.replace('files/', '').padEnd(64, '0'),
        sizeBytes: 1,
        mime: 'application/pdf',
        status: 'committed',
      });
    }
    return row.id;
  };

  const submissionIds = async () =>
    (await db.select().from(inboundWebhookSubmissions)).map((r) => r.id);

  beforeAll(async () => {
    db = getTestDb();
    storage = new MemoryStorage();
    app = await createTestApp((builder) =>
      builder.overrideProvider(STORAGE_ADAPTER).useValue(storage),
    );
    retention = app.get(InboundWebhookRetentionService);
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearAllTables(db);
    storage.objects.clear();
    const admin = await seedAdminContext(db);
    project = await seedTestProject(db, admin.serverId);
    const [row] = await db
      .insert(inboundWebhooks)
      .values({
        projectId: project.id,
        name: 'Retention',
        slug: 'retention',
        schema: { version: 1, fields: [] } as never,
        signingSecretEnc: encryptSecret(
          'whsec_test',
          process.env.INBOUND_WEBHOOK_ENCRYPTION_KEY as string,
        ),
        requireSignature: false,
      })
      .returning({ id: inboundWebhooks.id });
    webhookId = row.id;
  });

  it('removes drafts that ran out of time, and only those', async () => {
    const open = await addDraft('open', ahead(1));
    await addDraft('open', ago(1));
    await addDraft('expired', ago(2));
    const submitted = await addDraft('submitted', ago(2));

    const counts = await retention.runCleanup();

    expect(counts.drafts).toBe(2);
    const left = (await db.select().from(inboundWebhookDrafts)).map(
      (d) => d.id,
    );
    expect(left.sort()).toEqual([open, submitted].sort());
  });

  it('removes a submission past retention with its file, object and draft', async () => {
    const draft = await addDraft('submitted', ago(400));
    const old = await addSubmission(ago(366), 'files/old', draft);
    const recent = await addSubmission(ago(10), 'files/recent');

    const counts = await retention.runCleanup();

    expect(counts).toMatchObject({ submissions: 1, files: 1 });
    expect(await submissionIds()).toEqual([recent]);
    expect(
      (await db.select().from(inboundWebhookFiles)).map((f) => f.storageKey),
    ).toEqual(['files/recent']);
    expect(await db.select().from(inboundWebhookDrafts)).toHaveLength(0);
    expect(storage.objects.has('files/old')).toBe(false);
    expect(storage.objects.has('files/recent')).toBe(true);
    expect(old).not.toBe(recent);
  });

  it('keeps an object a newer submission still uses', async () => {
    await addSubmission(ago(400), 'files/shared');
    const recent = await addSubmission(ago(5), 'files/shared');

    const counts = await retention.runCleanup();

    expect(counts.submissions).toBe(1);
    expect(counts.files).toBe(0);
    expect(storage.objects.has('files/shared')).toBe(true);
    expect(await submissionIds()).toEqual([recent]);
  });

  it('keeps a submission whose object could not be deleted, for the next run', async () => {
    const stuck = await addSubmission(ago(400), 'files/stuck');
    const free = await addSubmission(ago(401));
    const original = storage.delete.bind(storage);
    storage.delete = () => Promise.reject(new Error('s3 down'));

    const first = await retention.runCleanup();
    // The one with nothing stored goes; the stuck one waits
    expect(first.submissions).toBe(1);
    expect(await submissionIds()).toEqual([stuck]);
    expect(await submissionIds()).not.toContain(free);

    storage.delete = original;
    await retention.runCleanup();
    expect(await submissionIds()).toEqual([]);
    expect(storage.objects.has('files/stuck')).toBe(false);
  });

  it('removes nothing from a webhook that only has recent data', async () => {
    await addSubmission(ago(1), 'files/a');
    const counts = await retention.runCleanup();
    expect(counts).toEqual({ drafts: 0, submissions: 0, files: 0 });
    expect(
      await db
        .select()
        .from(inboundWebhookFiles)
        .where(eq(inboundWebhookFiles.storageKey, 'files/a')),
    ).toHaveLength(1);
  });
});
