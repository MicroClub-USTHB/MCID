import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InboundWebhooksService } from './inbound-webhooks.service';

const ROLE = '700000000000000003';
const SCHEMA = {
  version: 1,
  fields: [{ key: 'a', type: 'string', required: false }],
};
const body = (over: Record<string, unknown> = {}) =>
  ({ name: 'Hackathon', slug: 'hackathon', schema: SCHEMA, ...over }) as never;

describe('InboundWebhooksService.createForProject', () => {
  let repository: Record<string, jest.Mock>;
  let audit: { insert: jest.Mock };
  let service: InboundWebhooksService;

  beforeEach(() => {
    repository = {
      findBySlug: jest.fn().mockResolvedValue(null),
      getSettings: jest.fn().mockResolvedValue(null),
      findExistingRoles: jest.fn((ids: string[]) =>
        Promise.resolve(
          ids
            .filter((id) => id === ROLE)
            .map((id) => ({
              id,
              serverId: 'srv-1',
              name: 'R',
              managed: false,
            })),
        ),
      ),
      findProjectServerIds: jest.fn().mockResolvedValue(['srv-1']),
      create: jest.fn((data: { slug: string }) =>
        Promise.resolve({ id: 'wh-1', slug: data.slug }),
      ),
    };
    audit = { insert: jest.fn().mockResolvedValue(undefined) };
    service = new InboundWebhooksService(
      repository as never,
      audit as never,
      {} as never,
      {
        get: (name: string, fallback?: unknown) =>
          name === 'app.inboundWebhookEncryptionKey'
            ? 'ab'.repeat(32)
            : fallback,
      } as never,
      {} as never,
    );
  });

  it('creates for the key project and returns only id, slug and the secret', async () => {
    const res = await service.createForProject(
      'proj-1',
      body({ allowedRoleIds: [ROLE] }),
    );

    expect(res).toEqual({
      id: 'wh-1',
      slug: 'hackathon',
      secret: expect.stringMatching(/^whsec_/),
    });
    expect(repository.create.mock.calls[0][0]).toMatchObject({
      projectId: 'proj-1',
      allowedRoleIds: [ROLE],
    });
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'webhook.created', actorId: null }),
    );
  });

  it('answers 422 with every schema error', async () => {
    const err = await service
      .createForProject('proj-1', body({ schema: { version: 1 } }))
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      errors: expect.any(Array),
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('answers 409 for a slug the project already uses', async () => {
    repository.findBySlug.mockResolvedValue({ id: 'x' });
    await expect(service.createForProject('proj-1', body())).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects reader roles from servers the project cannot access', async () => {
    repository.findProjectServerIds.mockResolvedValue(['other']);
    await expect(
      service.createForProject('proj-1', body({ allowedRoleIds: [ROLE] })),
    ).rejects.toThrow(BadRequestException);
  });
});
