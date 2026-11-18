import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { ApiConflictResponse, ApiHeader } from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../modules/idempotency/idempotency.interceptor';

/**
 * Decorates a Project API write route to accept an `Idempotency-Key` header.
 *
 * Guarantees:
 * - Replaying the same key and payload returns the cached response with `Idempotent-Replayed: true`.
 * - Reusing the same key with a different payload returns `409 Conflict`.
 * - Concurrent requests with the same key return `409 Conflict` without executing twice.
 */
export function Idempotent() {
  return applyDecorators(
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description:
        'Optional idempotency key (up to 128 characters). A retry with the same key returns the cached response.',
      schema: { type: 'string', maxLength: 128 },
    }),
    ApiConflictResponse({
      description:
        'Idempotency conflict: a request with this key is currently in progress, or the key was reused with a different payload.',
    }),
  );
}
