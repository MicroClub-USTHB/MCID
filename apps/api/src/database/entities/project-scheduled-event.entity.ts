import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { projects } from './project.entity';
import { servers } from './server.entity';

/**
 * Tracks Discord scheduled events created by projects via the Project API (EP-10).
 * A project is strictly forbidden from updating or deleting any scheduled event
 * that does not have an entry here.
 */
export const projectScheduledEvents = pgTable(
  'project_scheduled_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    serverId: varchar('server_id', { length: 255 })
      .references(() => servers.id, { onDelete: 'cascade' })
      .notNull(),
    eventId: varchar('event_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('idx_project_scheduled_events_server_event').on(
      t.serverId,
      t.eventId,
    ),
    index('idx_project_scheduled_events_project_server').on(
      t.projectId,
      t.serverId,
    ),
  ],
);
