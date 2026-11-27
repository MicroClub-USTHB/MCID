import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core';
import { members } from './member.entity';

/**
 * An account a member holds on an external service (GitHub today; GitLab,
 * Codeforces, ... later: a new `provider` value, no schema change).
 *
 * Deliberately a side table, not columns on `members`: only the members who
 * link something get a row.
 */
export const memberIdentities = pgTable(
  'member_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberId: varchar('member_id', { length: 255 })
      .references(() => members.id, { onDelete: 'cascade' })
      .notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    /** The provider's own stable id, when known. Null for a typed handle. */
    externalId: varchar('external_id', { length: 255 }),
    /** What people recognise: the GitHub login, stored lowercase. */
    handle: varchar('handle', { length: 255 }).notNull(),
    /** Set only when ownership was proven (OAuth). Null = taken on trust. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // One account per provider per member...
    memberProviderUniq: uniqueIndex('uq_member_identities_member_provider').on(
      t.memberId,
      t.provider,
    ),
    // ...and one member per account.
    providerHandleUniq: uniqueIndex('uq_member_identities_provider_handle').on(
      t.provider,
      t.handle,
    ),
    providerIdx: index('idx_member_identities_provider').on(t.provider),
  }),
);

export type MemberIdentity = typeof memberIdentities.$inferSelect;
