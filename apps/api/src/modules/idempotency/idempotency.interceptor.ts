import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { stableStringify } from '../../common/utils/stable-json.util';
import * as schema from '../../database/entities';
import { IdempotencyRepository } from './idempotency.repository';

export interface RequestWithProject extends Request {
  project?: typeof schema.projects.$inferSelect;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_KEY_LENGTH = 128;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Optional()
    private readonly repository?: IdempotencyRepository,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<RequestWithProject>();
    const res = httpCtx.getResponse<Response>();

    const rawHeader = req.headers['idempotency-key'];
    if (rawHeader === undefined) {
      return next.handle();
    }

    const key = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim();

    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key header must not be empty and must not exceed ${MAX_KEY_LENGTH} characters`,
      );
    }

    const projectId = req.project?.id;
    const repository = this.repository;
    if (!projectId || !repository) {
      // If the caller is not an authenticated project or repository is omitted, proceed
      return next.handle();
    }

    const path = (req.originalUrl || req.url || '').split('?')[0];
    const queryStr = stableStringify(req.query ?? {});
    const bodyStr = stableStringify(req.body ?? {});
    const hashInput = `${req.method.toUpperCase()}:${path}:${queryStr}:${bodyStr}`;
    const requestHash = createHash('sha256').update(hashInput).digest('hex');

    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

    const { reserved, row } = await repository.reserveKey({
      projectId,
      key,
      requestHash,
      expiresAt,
    });

    if (!reserved) {
      if (row.status === 'in_progress') {
        throw new ConflictException(
          'A request with this idempotency key is already in progress',
        );
      }

      if (row.status === 'completed') {
        if (row.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key reused with different request payload',
          );
        }

        // Replay cached response
        res.setHeader('Idempotent-Replayed', 'true');
        if (row.responseStatus) {
          res.status(row.responseStatus);
        }
        return of(row.responseBody);
      }
    }

    return next.handle().pipe(
      concatMap(async (data: unknown) => {
        try {
          await repository.completeKey({
            id: row.id,
            responseStatus: res.statusCode,
            responseBody: data,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to complete idempotency key ${key}: ${msg}`);
        }
        return data;
      }),
      catchError(async (err: unknown) => {
        try {
          await repository.releaseKey(row.id);
        } catch (releaseErr: unknown) {
          const msg =
            releaseErr instanceof Error
              ? releaseErr.message
              : String(releaseErr);
          this.logger.warn(`Failed to release idempotency key ${key}: ${msg}`);
        }
        throw err;
      }),
    );
  }
}
