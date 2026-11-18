import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { of, throwError, lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyRepository } from './idempotency.repository';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let repository: jest.Mocked<IdempotencyRepository>;

  const mockProject = {
    id: 'proj-123',
    name: 'Test Project',
    apiKeyHash: 'hash',
    keyPrefix: 'mc_live',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    isRoot: false,
    revokedAt: null,
  };

  const createMockContext = (
    headers: Record<string, string | string[] | undefined>,
    body = {},
    url = '/api/servers/123/roles',
    method = 'POST',
  ) => {
    const mockRequest: any = {
      headers,
      body,
      query: {},
      url,
      originalUrl: url,
      method,
      project: mockProject,
    };
    const mockResponse: any = {
      statusCode: 201,
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      mockRequest,
      mockResponse,
    } as unknown as ExecutionContext & { mockRequest: any; mockResponse: any };
  };

  const createMockCallHandler = (
    data: any = { id: 'role-1' },
  ): CallHandler => ({
    handle: () => of(data),
  });

  beforeEach(() => {
    repository = {
      findByIdempotencyKey: jest.fn(),
      reserveKey: jest.fn(),
      completeKey: jest.fn().mockResolvedValue(undefined),
      releaseKey: jest.fn().mockResolvedValue(undefined),
      deleteExpiredKeys: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyRepository>;

    interceptor = new IdempotencyInterceptor(repository);
  });

  it('should bypass interceptor if Idempotency-Key header is absent', async () => {
    const context = createMockContext({});
    const next = createMockCallHandler();

    const result$ = await interceptor.intercept(context, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ id: 'role-1' });
    expect(repository.reserveKey).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if Idempotency-Key is empty or whitespace', async () => {
    const context = createMockContext({ 'idempotency-key': '   ' });
    const next = createMockCallHandler();

    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException if Idempotency-Key exceeds 128 chars', async () => {
    const longKey = 'a'.repeat(129);
    const context = createMockContext({ 'idempotency-key': longKey });
    const next = createMockCallHandler();

    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should bypass if request has no authenticated project', async () => {
    const context = createMockContext({ 'idempotency-key': 'key-123' });
    delete (context as any).mockRequest.project;
    const next = createMockCallHandler();

    const result$ = await interceptor.intercept(context, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ id: 'role-1' });
    expect(repository.reserveKey).not.toHaveBeenCalled();
  });

  it('should reserve key and call completeKey on successful handler execution', async () => {
    const context = createMockContext(
      { 'idempotency-key': 'unique-key' },
      { name: 'VIP' },
    );
    const next = createMockCallHandler({ roleId: 'role-999' });

    repository.reserveKey.mockResolvedValue({
      reserved: true,
      row: {
        id: 'rec-1',
        projectId: mockProject.id,
        key: 'unique-key',
        requestHash: 'expected-hash',
        status: 'in_progress',
        responseStatus: null,
        responseBody: null,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const result$ = await interceptor.intercept(context, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ roleId: 'role-999' });
    expect(repository.reserveKey).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: mockProject.id,
        key: 'unique-key',
        staleBefore: expect.any(Date),
      }),
    );
    expect(repository.completeKey).toHaveBeenCalledWith({
      id: 'rec-1',
      responseStatus: 201,
      responseBody: { roleId: 'role-999' },
    });
  });

  it('should release key reservation if handler throws an error', async () => {
    const context = createMockContext({ 'idempotency-key': 'failing-key' });
    const next: CallHandler = {
      handle: () => throwError(() => new Error('Discord down')),
    };

    repository.reserveKey.mockResolvedValue({
      reserved: true,
      row: {
        id: 'rec-fail',
        projectId: mockProject.id,
        key: 'failing-key',
        requestHash: 'hash',
        status: 'in_progress',
        responseStatus: null,
        responseBody: null,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const result$ = await interceptor.intercept(context, next);
    await expect(lastValueFrom(result$)).rejects.toThrow('Discord down');

    expect(repository.releaseKey).toHaveBeenCalledWith('rec-fail');
  });

  it('should throw ConflictException 409 if a request with key is in progress', async () => {
    const context = createMockContext({ 'idempotency-key': 'concurrent-key' });
    const next = createMockCallHandler();

    repository.reserveKey.mockResolvedValue({
      reserved: false,
      row: {
        id: 'rec-concurrent',
        projectId: mockProject.id,
        key: 'concurrent-key',
        requestHash: 'hash',
        status: 'in_progress',
        responseStatus: null,
        responseBody: null,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      new ConflictException(
        'A request with this idempotency key is already in progress',
      ),
    );
    expect(repository.completeKey).not.toHaveBeenCalled();
  });

  it('should throw ConflictException 409 if key was completed with a different request payload', async () => {
    const context = createMockContext(
      { 'idempotency-key': 'reused-key' },
      { name: 'New Payload' },
    );
    const next = createMockCallHandler();

    repository.reserveKey.mockResolvedValue({
      reserved: false,
      row: {
        id: 'rec-diff',
        projectId: mockProject.id,
        key: 'reused-key',
        requestHash: 'different-hash-from-past',
        status: 'completed',
        responseStatus: 201,
        responseBody: { ok: true },
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      new ConflictException(
        'Idempotency key reused with different request payload',
      ),
    );
  });

  it('should replay cached response with Idempotent-Replayed header if payload matches', async () => {
    const context = createMockContext(
      { 'idempotency-key': 'replayed-key' },
      { name: 'Exact Match' },
    );
    const next = createMockCallHandler();

    // First call to reserveKey to extract generated hash
    let capturedHash = '';
    repository.reserveKey.mockImplementation((params) => {
      capturedHash = params.requestHash;
      return Promise.resolve({
        reserved: false,
        row: {
          id: 'rec-replay',
          projectId: mockProject.id,
          key: 'replayed-key',
          requestHash: capturedHash,
          status: 'completed',
          responseStatus: 201,
          responseBody: { roleId: 'cached-role-123' },
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    const result$ = await interceptor.intercept(context, next);
    const result = await lastValueFrom(result$);

    expect(result).toEqual({ roleId: 'cached-role-123' });
    expect((context as any).mockResponse.setHeader).toHaveBeenCalledWith(
      'Idempotent-Replayed',
      'true',
    );
    expect((context as any).mockResponse.status).toHaveBeenCalledWith(201);
  });
});
