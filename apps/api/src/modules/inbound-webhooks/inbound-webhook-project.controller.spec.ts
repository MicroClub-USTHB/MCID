import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ProjectThrottlerGuard } from '../channels/guards/project-throttler.guard';
import { InboundWebhookProjectController } from './inbound-webhook-project.controller';
import { InboundWebhooksService } from './inbound-webhooks.service';

const row = {
  id: 'iw_01',
  projectId: 'proj-1',
  name: 'Hackathon 2026',
  slug: 'hackathon-2026',
  schema: { version: 1, fields: [] },
  acceptedOrigins: ['https://x.dz'],
  requireSignature: true,
  isActive: true,
  createdAt: new Date('2026-11-01T09:00:00Z'),
};

describe('InboundWebhookProjectController', () => {
  let app: INestApplication;
  const service = {
    createForProject: jest
      .fn()
      .mockResolvedValue({ id: 'iw_01', slug: 'h', secret: 'whsec_x' }),
    listForProject: jest.fn().mockResolvedValue({ rows: [row], total: 1 }),
    getSubmissionForProject: jest.fn().mockResolvedValue({ id: 's1' }),
    listSubmissionsForProject: jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
  };
  const apiKeyGuard = {
    canActivate: jest.fn((ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest<{
        headers: Record<string, string>;
        project?: { id: string };
      }>();
      if (!req.headers['x-api-key']) throw new UnauthorizedException();
      req.project = { id: 'proj-1' };
      return true;
    }),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      controllers: [InboundWebhookProjectController],
      providers: [
        { provide: InboundWebhooksService, useValue: service },
        ProjectThrottlerGuard,
        Reflector,
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(apiKeyGuard)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('lists only the key project and never leaks secrets or other fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/project/inbound-webhooks')
      .set('x-api-key', 'k')
      .expect(200);

    expect(service.listForProject).toHaveBeenCalledWith('proj-1', 50, 0);
    expect(res.body).toEqual({
      items: [
        {
          id: 'iw_01',
          name: 'Hackathon 2026',
          slug: 'hackathon-2026',
          active: true,
          schema: row.schema,
          createdAt: '2026-11-01T09:00:00.000Z',
        },
      ],
      total: 1,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|projectId/i);
  });

  it('passes limit and offset through', async () => {
    await request(app.getHttpServer())
      .get('/project/inbound-webhooks?limit=10&offset=20')
      .set('x-api-key', 'k')
      .expect(200);
    expect(service.listForProject).toHaveBeenLastCalledWith('proj-1', 10, 20);
  });

  it('rejects an out-of-range limit with 400', async () => {
    await request(app.getHttpServer())
      .get('/project/inbound-webhooks?limit=500')
      .set('x-api-key', 'k')
      .expect(400);
  });

  it('creates for the key project and returns the secret', async () => {
    const payload = { name: 'H', slug: 'hackathon', schema: { version: 1 } };
    await request(app.getHttpServer())
      .post('/project/inbound-webhooks')
      .set('x-api-key', 'k')
      .send(payload)
      .expect(201, { id: 'iw_01', slug: 'h', secret: 'whsec_x' });
    expect(service.createForProject).toHaveBeenCalledWith('proj-1', payload);
  });

  it('rejects a projectId in the body', async () => {
    await request(app.getHttpServer())
      .post('/project/inbound-webhooks')
      .set('x-api-key', 'k')
      .send({ name: 'H', slug: 'hackathon', schema: {}, projectId: 'other' })
      .expect(400);
  });

  it('answers 401 without a valid key', async () => {
    await request(app.getHttpServer())
      .get('/project/inbound-webhooks')
      .expect(401);
  });

  it('passes the key project, cursor, limit and dates to the submissions read', async () => {
    await request(app.getHttpServer())
      .get(
        '/project/inbound-webhooks/iw_01/submissions?serverId=123456789012345678&cursor=abc&limit=7',
      )
      .set('x-api-key', 'k')
      .expect(200, { items: [], nextCursor: null });
    expect(service.listSubmissionsForProject).toHaveBeenCalledWith(
      'iw_01',
      'proj-1',
      expect.objectContaining({ cursor: 'abc', limit: 7 }),
    );
  });

  it('rejects a submissions limit above 200 with 400', async () => {
    await request(app.getHttpServer())
      .get(
        '/project/inbound-webhooks/iw_01/submissions?serverId=123456789012345678&limit=201',
      )
      .set('x-api-key', 'k')
      .expect(400);
  });

  it('reads one submission for the key project', async () => {
    const sid = '0b6f5c1e-7d2a-4c8e-9f1a-3e5b7c9d1f20';
    await request(app.getHttpServer())
      .get(
        `/project/inbound-webhooks/iw_01/submissions/${sid}?serverId=123456789012345678`,
      )
      .set('x-api-key', 'k')
      .expect(200, { id: 's1' });
    expect(service.getSubmissionForProject).toHaveBeenCalledWith(
      'iw_01',
      sid,
      'proj-1',
    );
  });

  it('rejects a malformed submission id with 400', async () => {
    await request(app.getHttpServer())
      .get(
        '/project/inbound-webhooks/iw_01/submissions/nope?serverId=123456789012345678',
      )
      .set('x-api-key', 'k')
      .expect(400);
  });
});
