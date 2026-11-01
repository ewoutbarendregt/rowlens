import { type SQL, sql } from 'drizzle-orm';
import { pgPolicy, pgRole, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * The role the app and the worker connect as (ADR-0005): no BYPASSRLS, owns nothing. Created by the
 * migrate command before the migrations run, so migrations only reference it.
 */
export const appRole = pgRole('rowlens_app').existing();

/** The club set by `withTenant` for the current transaction; NULL outside one, so policies match nothing. */
export const currentClubId: SQL = sql`nullif(current_setting('app.club_id', true), '')::uuid`;

/**
 * Every tenant table gets this policy: rows of the current club only, for reads and writes. A schema
 * test fails if a table with a `club_id` column has no RLS or no policy.
 */
export function tenantPolicy(name: string, clubId: SQL) {
  return pgPolicy(name, {
    for: 'all',
    to: appRole,
    using: sql`${clubId} = ${currentClubId}`,
    withCheck: sql`${clubId} = ${currentClubId}`,
  });
}

export const club = pgTable(
  'club',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The app may read its own club; clubs are created by migrations or admin tooling, not the app.
  (t) => [
    pgPolicy('club_read_own', {
      for: 'select',
      to: appRole,
      using: sql`${t.id} = ${currentClubId}`,
    }),
  ],
).enableRLS();
