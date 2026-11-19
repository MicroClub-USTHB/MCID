import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InboundWebhooksService } from './inbound-webhooks.service';

const ID = '0b6f5c1e-7d2a-4c8e-9f1a-3e5b7c9d1f20';
const row = (n: number) => ({
  id: ID,
  payload: { n },
  receivedAt: new Date('2026-01-01T00:00:00.123Z'),
  origin: null,
  cursorAt: '2026-01-01 00:00:00.123456+00',
});

describe('InboundWebhooksService.listSubmissionsForProject', () => {
  const repository = {
    findById: jest.fn(),
    listSubmissionsAfter: jest.fn(),
    findSubmission: jest.fn(),
  };
  const audit = { insert: jest.fn().mockResolvedValue(undefined) };
  const service = new InboundWebhooksService(
    repository as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findById.mockResolvedValue({ id: 'wh', projectId: 'p1' });
    repository.listSubmissionsAfter.mockResolvedValue([row(1), row(2)]);
  });

  it('returns a cursor that keeps microseconds when a page is full', async () => {
    const res = await service.listSubmissionsForProject('wh', 'p1', {
      limit: 1,
    });
    expect(res.items).toHaveLength(1);
    const decoded = JSON.parse(
      Buffer.from(res.nextCursor as string, 'base64url').toString(),
    );
    expect(decoded).toEqual({ r: '2026-01-01 00:00:00.123456+00', i: ID });
    expect(audit.insert).toHaveBeenCalledTimes(1);
  });

  it('returns a null cursor on the last page', async () => {
    const res = await service.listSubmissionsForProject('wh', 'p1', {
      limit: 5,
    });
    expect(res.nextCursor).toBeNull();
  });

  it("hides another project's webhook behind a 404", async () => {
    await expect(
      service.listSubmissionsForProject('wh', 'p2', { limit: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.listSubmissionsAfter).not.toHaveBeenCalled();
  });

  it.each(['%%%', Buffer.from('{"r":"x","i":"y"}').toString('base64url')])(
    'rejects the malformed cursor %s with 400',
    async (cursor) => {
      await expect(
        service.listSubmissionsForProject('wh', 'p1', { limit: 5, cursor }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

describe('InboundWebhooksService.getSubmissionForProject', () => {
  const repository = { findById: jest.fn(), findSubmission: jest.fn() };
  const audit = { insert: jest.fn().mockResolvedValue(undefined) };
  const service = new InboundWebhooksService(
    repository as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findById.mockResolvedValue({ id: 'wh', projectId: 'p1' });
    repository.findSubmission.mockResolvedValue({
      ...row(1),
      ipAddress: '1.1.1.1',
    });
  });

  it('returns the list fields only and audits the read', async () => {
    const res = await service.getSubmissionForProject('wh', ID, 'p1');
    expect(res).toEqual({
      id: ID,
      payload: { n: 1 },
      receivedAt: '2026-01-01T00:00:00.123Z',
      origin: null,
    });
    expect(audit.insert).toHaveBeenCalledTimes(1);
  });

  it("hides another project's webhook behind a 404", async () => {
    await expect(
      service.getSubmissionForProject('wh', ID, 'p2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findSubmission).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown submission, without auditing', async () => {
    repository.findSubmission.mockResolvedValue(null);
    await expect(
      service.getSubmissionForProject('wh', ID, 'p1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.insert).not.toHaveBeenCalled();
  });
});
