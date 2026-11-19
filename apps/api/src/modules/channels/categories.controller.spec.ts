import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { CategoriesController } from './categories.controller';
import { ChannelsService } from './channels.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ProjectThrottlerGuard } from './guards/project-throttler.guard';

describe('CategoriesController (integration)', () => {
  let app: INestApplication;

  const mockService = {
    createCategory: jest.fn(),
  };

  const mockApiKeyGuard = {
    canActivate: jest.fn().mockResolvedValue(true),
  };

  const mockProjectThrottlerGuard = {
    canActivate: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: ChannelsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(mockApiKeyGuard)
      .overrideGuard(ProjectThrottlerGuard)
      .useValue(mockProjectThrottlerGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /servers/:serverId/categories', () => {
    it('returns 201 and created category on valid payload', async () => {
      mockService.createCategory.mockResolvedValue({
        id: 'cat-123',
        name: 'Hackathon 2026',
      });

      const res = await request(app.getHttpServer())
        .post('/servers/123/categories')
        .set('X-API-Key', 'test-key')
        .set('Idempotency-Key', 'key-1')
        .send({ name: 'Hackathon 2026' })
        .expect(201);

      expect(res.body).toEqual({
        id: 'cat-123',
        name: 'Hackathon 2026',
      });
      expect(mockService.createCategory).toHaveBeenCalledWith(
        undefined,
        '123',
        { name: 'Hackathon 2026' },
      );
    });

    it('returns 400 when name is empty', async () => {
      await request(app.getHttpServer())
        .post('/servers/123/categories')
        .set('X-API-Key', 'test-key')
        .set('Idempotency-Key', 'key-1')
        .send({ name: '' })
        .expect(400);
    });

    it('returns 400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/servers/123/categories')
        .set('X-API-Key', 'test-key')
        .set('Idempotency-Key', 'key-1')
        .send({})
        .expect(400);
    });
  });
});
