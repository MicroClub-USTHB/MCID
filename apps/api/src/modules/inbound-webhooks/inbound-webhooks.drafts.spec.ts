import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DraftNotOpenError } from './inbound-webhooks.repository';
import { InboundWebhooksService } from './inbound-webhooks.service';

const WEBHOOK = '11111111-1111-4111-8111-111111111111';
const DRAFT = '22222222-2222-4222-8222-222222222222';
const PROJECT = 'project-1';
const NOW = Date.parse('2026-01-01T00:00:00Z');
const HOUR = 3_600_000;

const STEPPED = {
  version: 1,
  steps: [
    {
      key: 'identity',
      fields: [
        { key: 'name', type: 'string', required: true },
        { key: 'wantsMentor', type: 'boolean', required: true },
      ],
    },
    {
      key: 'mentor',
      condition: { op: 'eq', field: 'identity.wantsMentor', value: true },
      fields: [{ key: 'topic', type: 'string', required: true }],
    },
  ],
};

const draftRow = (overrides: Record<string, unknown> = {}) => ({
  id: DRAFT,
  webhookId: WEBHOOK,
  projectId: PROJECT,
  data: {},
  completedSteps: [],
  status: 'open',
  expiresAt: new Date(NOW + HOUR),
  ...overrides,
});

describe('InboundWebhooksService drafts', () => {
  let repository: Record<string, jest.Mock>;
  let service: InboundWebhooksService;
  const ctx = { projectId: PROJECT, rawBody: Buffer.alloc(0) };

  const build = (schema: object = STEPPED, ttlHours?: number) => {
    repository = {
      findByIdWithSecret: jest.fn().mockResolvedValue({
        id: WEBHOOK,
        projectId: PROJECT,
        isActive: true,
        acceptedOrigins: [],
        requireSignature: false,
        rejectUnknownFields: true,
        signingSecretEnc: 'unused',
        schema,
      }),
      findFilesByIds: jest.fn().mockResolvedValue([]),
      insertDraft: jest
        .fn()
        .mockImplementation((d) => Promise.resolve({ id: DRAFT, ...d })),
      findDraft: jest.fn().mockResolvedValue(draftRow()),
      saveDraftStep: jest
        .fn()
        .mockImplementation((id) =>
          Promise.resolve(draftRow({ id, completedSteps: ['identity'] })),
        ),
      expireDraft: jest.fn().mockResolvedValue(undefined),
      insertSubmission: jest
        .fn()
        .mockResolvedValue({ id: 'sub-1', receivedAt: new Date(NOW) }),
    };
    service = new InboundWebhooksService(
      repository as never,
      { insert: jest.fn().mockResolvedValue(undefined) } as never,
      {
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn(),
        delete: jest.fn(),
      } as never,
      {
        get: (name: string, fallback: unknown) =>
          name === 'INBOUND_WEBHOOK_DRAFT_TTL_H' && ttlHours !== undefined
            ? ttlHours
            : fallback,
      } as never,
      {} as never,
    );
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask'] });
    build();
  });

  afterEach(() => jest.useRealTimers());

  describe('createDraft', () => {
    it('expires after the configured number of hours', async () => {
      build(STEPPED, 2);
      const res = await service.createDraft(WEBHOOK, ctx);
      expect(res).toEqual({
        draftId: DRAFT,
        expiresAt: new Date(NOW + 2 * HOUR).toISOString(),
      });
    });

    it('defaults to 24 hours', async () => {
      const res = await service.createDraft(WEBHOOK, ctx);
      expect(res.expiresAt).toBe(new Date(NOW + 24 * HOUR).toISOString());
    });

    it('refuses a webhook without steps', async () => {
      build({ version: 1, fields: [{ key: 'a', type: 'string' }] });
      await expect(service.createDraft(WEBHOOK, ctx)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.insertDraft).not.toHaveBeenCalled();
    });
  });

  describe('patchDraftStep', () => {
    it('stores only the step values the schema accepted', async () => {
      await service.patchDraftStep(
        WEBHOOK,
        DRAFT,
        'identity',
        { name: 'Ada', wantsMentor: true },
        ctx,
      );
      expect(repository.saveDraftStep).toHaveBeenCalledWith(DRAFT, 'identity', {
        name: 'Ada',
        wantsMentor: true,
      });
    });

    it('reads a step condition against the steps already saved', async () => {
      repository.findDraft.mockResolvedValue(
        draftRow({ data: { identity: { name: 'Ada', wantsMentor: true } } }),
      );
      await expect(
        service.patchDraftStep(WEBHOOK, DRAFT, 'mentor', {}, ctx),
      ).rejects.toMatchObject({
        response: {
          errors: [expect.objectContaining({ path: 'mentor.topic' })],
        },
      });
    });

    it('stores nothing for a step whose condition is false', async () => {
      repository.findDraft.mockResolvedValue(
        draftRow({ data: { identity: { name: 'Ada', wantsMentor: false } } }),
      );
      await service.patchDraftStep(
        WEBHOOK,
        DRAFT,
        'mentor',
        { topic: 'x' },
        ctx,
      );
      expect(repository.saveDraftStep).toHaveBeenCalledWith(
        DRAFT,
        'mentor',
        undefined,
      );
    });

    it('answers 422 for an unknown step and saves nothing', async () => {
      await expect(
        service.patchDraftStep(WEBHOOK, DRAFT, 'nope', {}, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(repository.saveDraftStep).not.toHaveBeenCalled();
    });

    it('answers 409 or 410 when the draft closes between the read and the write', async () => {
      repository.saveDraftStep.mockResolvedValue(null);
      repository.findDraft
        .mockResolvedValueOnce(draftRow())
        .mockResolvedValueOnce(draftRow({ status: 'submitted' }));
      await expect(
        service.patchDraftStep(
          WEBHOOK,
          DRAFT,
          'identity',
          { name: 'Ada', wantsMentor: false },
          ctx,
        ),
      ).rejects.toThrow(ConflictException);

      repository.findDraft
        .mockResolvedValueOnce(draftRow())
        .mockResolvedValueOnce(draftRow({ status: 'open' }));
      await expect(
        service.patchDraftStep(
          WEBHOOK,
          DRAFT,
          'identity',
          { name: 'Ada', wantsMentor: false },
          ctx,
        ),
      ).rejects.toThrow(GoneException);
      expect(repository.expireDraft).toHaveBeenCalledWith(DRAFT);
    });
  });

  describe('draft lookup', () => {
    const patch = () =>
      service.patchDraftStep(
        WEBHOOK,
        DRAFT,
        'identity',
        { name: 'Ada', wantsMentor: false },
        ctx,
      );

    it('answers 404 for an unknown draft, a bad id, or another webhook', async () => {
      repository.findDraft.mockResolvedValue(null);
      await expect(patch()).rejects.toThrow(NotFoundException);

      repository.findDraft.mockResolvedValue(draftRow({ webhookId: 'other' }));
      await expect(patch()).rejects.toThrow(NotFoundException);

      await expect(
        service.patchDraftStep(WEBHOOK, 'not-a-uuid', 'identity', {}, ctx),
      ).rejects.toThrow(NotFoundException);
    });

    it('answers 409 for a submitted draft', async () => {
      repository.findDraft.mockResolvedValue(draftRow({ status: 'submitted' }));
      await expect(patch()).rejects.toThrow(ConflictException);
    });

    it('answers 410 for an expired draft and marks a lapsed open one', async () => {
      repository.findDraft.mockResolvedValue(draftRow({ status: 'expired' }));
      await expect(patch()).rejects.toThrow(GoneException);
      expect(repository.expireDraft).not.toHaveBeenCalled();

      repository.findDraft.mockResolvedValue(
        draftRow({ expiresAt: new Date(NOW - 1) }),
      );
      await expect(patch()).rejects.toThrow(GoneException);
      expect(repository.expireDraft).toHaveBeenCalledWith(DRAFT);
    });
  });

  describe('submitDraft', () => {
    it('submits the accumulated payload with the draft id', async () => {
      repository.findDraft.mockResolvedValue(
        draftRow({ data: { identity: { name: 'Ada', wantsMentor: false } } }),
      );
      const res = await service.submitDraft(WEBHOOK, DRAFT, ctx);
      expect(res).toEqual({
        id: 'sub-1',
        receivedAt: new Date(NOW).toISOString(),
      });
      expect(repository.insertSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: DRAFT,
          payload: { identity: { name: 'Ada', wantsMentor: false } },
        }),
      );
    });

    it('answers 422 when a required step was never sent', async () => {
      await expect(service.submitDraft(WEBHOOK, DRAFT, ctx)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repository.insertSubmission).not.toHaveBeenCalled();
    });

    it('answers 409 when another request claimed the draft first', async () => {
      repository.findDraft
        .mockResolvedValueOnce(
          draftRow({ data: { identity: { name: 'Ada', wantsMentor: false } } }),
        )
        .mockResolvedValueOnce(draftRow({ status: 'submitted' }));
      repository.insertSubmission.mockRejectedValue(new DraftNotOpenError());
      await expect(service.submitDraft(WEBHOOK, DRAFT, ctx)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows other storage errors', async () => {
      repository.findDraft.mockResolvedValue(
        draftRow({ data: { identity: { name: 'Ada', wantsMentor: false } } }),
      );
      repository.insertSubmission.mockRejectedValue(new Error('db down'));
      await expect(service.submitDraft(WEBHOOK, DRAFT, ctx)).rejects.toThrow(
        'db down',
      );
    });
  });
});
