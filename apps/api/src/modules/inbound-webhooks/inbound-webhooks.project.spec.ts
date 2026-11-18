import { InboundWebhooksService } from './inbound-webhooks.service';

const row = { id: 'wh-1', projectId: 'p1' };
const VALID = {
  version: 1,
  fields: [{ key: 'name', type: 'string', required: true }],
};

describe('InboundWebhooksService project update and rotation', () => {
  let repository: Record<string, jest.Mock>;
  let audit: { insert: jest.Mock };
  let service: InboundWebhooksService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
      updateSecret: jest.fn().mockResolvedValue(undefined),
    };
    audit = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new InboundWebhooksService(
      repository as never,
      audit as never,
      {} as never,
      {
        get: (name: string, fallback: unknown) =>
          name === 'app.inboundWebhookEncryptionKey'
            ? 'ab'.repeat(32)
            : fallback,
      } as never,
      {} as never,
    );
  });

  it('stores a valid schema and audits it with the project id', async () => {
    await service.updateForProject('p1', 'wh-1', { schema: VALID });

    expect(repository.update).toHaveBeenCalledWith('wh-1', { schema: VALID });
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webhook.updated',
        actorId: null,
        details: { fields: ['schema'], projectId: 'p1' },
      }),
    );
  });

  it('answers 422 for an invalid schema and stores nothing', async () => {
    await expect(
      service.updateForProject('p1', 'wh-1', { schema: { version: 1 } }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("answers 404 for another project's webhook", async () => {
    await expect(
      service.updateForProject('other', 'wh-1', { schema: VALID }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.rotateSecretForProject('other', 'wh-1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.updateSecret).not.toHaveBeenCalled();
  });

  it('rotates, returns the new secret once and audits it', async () => {
    const secret = await service.rotateSecretForProject('p1', 'wh-1');

    expect(secret).toMatch(/^whsec_/);
    expect(repository.updateSecret).toHaveBeenCalledTimes(1);
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'secret.rotated',
        details: { projectId: 'p1' },
      }),
    );
  });
});
