import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { projects } from './project.entity';
import { roles } from './role.entity';
import { servers } from './server.entity';

/**
 * Tracks Discord roles created by projects via the Project API (EP-08).
 * A project is strictly forbidden from granting or removing any role
 * that does not have an entry here.
 */
export const projectCreatedRoles = pgTable(
  'project_created_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: varchar('role_id', { length: 255 })
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    serverId: varchar('server_id', { length: 255 })
      .references(() => servers.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('idx_project_created_roles_project_role').on(
      t.projectId,
      t.roleId,
    ),
  ],
);
