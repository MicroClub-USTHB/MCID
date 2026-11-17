import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module';
import * as schema from '../../database/entities';

export type Executor = Pick<
  NodePgDatabase<typeof schema>,
  'select' | 'insert' | 'delete'
>;

export type ProjectScheduledEventRow =
  typeof schema.projectScheduledEvents.$inferSelect;

@Injectable()
export class ProjectScheduledEventsRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Records a scheduled event created on Discord by a project.
   */
  async recordCreatedEvent(
    params: {
      projectId: string;
      serverId: string;
      eventId: string;
    },
    executor: Executor = this.db,
  ): Promise<ProjectScheduledEventRow> {
    const [row] = await executor
      .insert(schema.projectScheduledEvents)
      .values({
        projectId: params.projectId,
        serverId: params.serverId,
        eventId: params.eventId,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      // If already recorded (e.g. race/conflict), fetch the existing row
      const existing = await this.findOwnedEvent(
        params.projectId,
        params.serverId,
        params.eventId,
        executor,
      );
      if (!existing) {
        throw new Error('Failed to record or retrieve scheduled event');
      }
      return existing;
    }

    return row;
  }

  /**
   * Finds a scheduled event only if it was created by this project on this server.
   */
  async findOwnedEvent(
    projectId: string,
    serverId: string,
    eventId: string,
    executor: Executor = this.db,
  ): Promise<ProjectScheduledEventRow | null> {
    const [row] = await executor
      .select()
      .from(schema.projectScheduledEvents)
      .where(
        and(
          eq(schema.projectScheduledEvents.projectId, projectId),
          eq(schema.projectScheduledEvents.serverId, serverId),
          eq(schema.projectScheduledEvents.eventId, eventId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Deletes the scheduled event ownership record.
   */
  async deleteOwnedEvent(
    projectId: string,
    serverId: string,
    eventId: string,
    executor: Executor = this.db,
  ): Promise<boolean> {
    const deleted = await executor
      .delete(schema.projectScheduledEvents)
      .where(
        and(
          eq(schema.projectScheduledEvents.projectId, projectId),
          eq(schema.projectScheduledEvents.serverId, serverId),
          eq(schema.projectScheduledEvents.eventId, eventId),
        ),
      )
      .returning();

    return deleted.length > 0;
  }
}
