import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { projects } from './project.entity';

/**
 * Stores idempotency keys for project write endpoints (EP-06).
 * Enforces atomic concurrency locking and replay safety across API instances.
 */
export const projectIdempotencyKeys = pgTable(
  'project_idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(), // 'in_progress' | 'completed'
    responseStatus: integer('response_status'),
    responseHeaders: jsonb('response_headers'),
    responseBody: jsonb('response_body'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('idx_project_idempotency_keys_project_key').on(
      t.projectId,
      t.key,
    ),
    index('idx_project_idempotency_keys_expires_at').on(t.expiresAt),
  ],
);
