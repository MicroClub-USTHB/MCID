import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, lte, or } from 'drizzle-orm';
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
   * An expired key, or one stuck `in_progress` for longer than `staleBefore`
   * allows (the request died before completing or releasing it), is taken over
   * by a single conditional UPDATE, so only one competing request wins it.
   * Otherwise returns `{ reserved: false, row: existing }`.
   */
  async reserveKey(params: {
    projectId: string;
    key: string;
    requestHash: string;
    expiresAt: Date;
    staleBefore: Date;
  }): Promise<{ reserved: boolean; row: IdempotencyRecord }> {
    const t = schema.projectIdempotencyKeys;
    const [inserted] = await this.db
      .insert(t)
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

    const now = new Date();
    const [reclaimed] = await this.db
      .update(t)
      .set({
        requestHash: params.requestHash,
        status: 'in_progress',
        responseStatus: null,
        responseBody: null,
        expiresAt: params.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(t.projectId, params.projectId),
          eq(t.key, params.key),
          or(
            lte(t.expiresAt, now),
            and(
              eq(t.status, 'in_progress'),
              lt(t.updatedAt, params.staleBefore),
            ),
          ),
        ),
      )
      .returning();

    if (reclaimed) {
      return { reserved: true, row: reclaimed };
    }

    const existing = await this.findByIdempotencyKey(
      params.projectId,
      params.key,
    );
    if (!existing) {
      // Released between our insert and read: let the client retry.
      throw new ConflictException(
        'A request with this idempotency key is already in progress',
      );
    }
    return { reserved: false, row: existing };
  }

  /**
   * Marks a reserved key as completed with its response payload and HTTP status.
   */
  async completeKey(params: {
    id: string;
    responseStatus: number;
    responseBody?: unknown;
  }): Promise<void> {
    await this.db
      .update(schema.projectIdempotencyKeys)
      .set({
        status: 'completed',
        responseStatus: params.responseStatus,
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
