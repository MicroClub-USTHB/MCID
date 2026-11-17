import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/entities';

export type IdempotencyRecord =
  typeof schema.projectIdempotencyKeys.$inferSelect;

@Injectable()
export class IdempotencyRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findByIdempotencyKey(
    projectId: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.projectIdempotencyKeys)
      .where(
        and(
          eq(schema.projectIdempotencyKeys.projectId, projectId),
          eq(schema.projectIdempotencyKeys.key, key),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Atomically reserves an idempotency key.
   * If the key already exists for this project, returns `{ reserved: false, row: existing }`.
   */
  async reserveKey(params: {
    projectId: string;
    key: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<{ reserved: boolean; row: IdempotencyRecord }> {
    const [inserted] = await this.db
      .insert(schema.projectIdempotencyKeys)
      .values({
        projectId: params.projectId,
        key: params.key,
        requestHash: params.requestHash,
        status: 'in_progress',
        expiresAt: params.expiresAt,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return { reserved: true, row: inserted };
    }

    const existing = await this.findByIdempotencyKey(
      params.projectId,
      params.key,
    );

    if (existing && existing.expiresAt <= new Date()) {
      // Key is expired; delete and re-insert atomically
      await this.db
        .delete(schema.projectIdempotencyKeys)
        .where(eq(schema.projectIdempotencyKeys.id, existing.id));

      const [reinserted] = await this.db
        .insert(schema.projectIdempotencyKeys)
        .values({
          projectId: params.projectId,
          key: params.key,
          requestHash: params.requestHash,
          status: 'in_progress',
          expiresAt: params.expiresAt,
        })
        .onConflictDoNothing()
        .returning();

      if (reinserted) {
        return { reserved: true, row: reinserted };
      }

      const fresh = await this.findByIdempotencyKey(
        params.projectId,
        params.key,
      );
      return { reserved: false, row: fresh! };
    }

    return { reserved: false, row: existing! };
  }

  /**
   * Marks a reserved key as completed with its response payload and HTTP status.
   */
  async completeKey(params: {
    id: string;
    responseStatus: number;
    responseHeaders?: Record<string, unknown>;
    responseBody?: unknown;
  }): Promise<void> {
    await this.db
      .update(schema.projectIdempotencyKeys)
      .set({
        status: 'completed',
        responseStatus: params.responseStatus,
        responseHeaders: params.responseHeaders ?? null,
        responseBody: params.responseBody ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectIdempotencyKeys.id, params.id));
  }

  /**
   * Releases an in-progress key reservation if processing fails with an error,
   * allowing the client to retry.
   */
  async releaseKey(id: string): Promise<void> {
    await this.db
      .delete(schema.projectIdempotencyKeys)
      .where(
        and(
          eq(schema.projectIdempotencyKeys.id, id),
          eq(schema.projectIdempotencyKeys.status, 'in_progress'),
        ),
      );
  }

  /**
   * Purges keys whose expiration timestamp has passed.
   */
  async deleteExpiredKeys(now = new Date()): Promise<number> {
    const deleted = await this.db
      .delete(schema.projectIdempotencyKeys)
      .where(lt(schema.projectIdempotencyKeys.expiresAt, now))
      .returning({ id: schema.projectIdempotencyKeys.id });

    return deleted.length;
  }
}
