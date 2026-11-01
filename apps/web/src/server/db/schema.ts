import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import {
  bigint,
  date,
  foreignKey,
  index,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

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
export function tenantPolicy(name: string, clubId: SQLWrapper) {
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

/** A training on the water: the unit coaches upload to and crews discuss (#44, minimal for the pilot). */
export const rowingSession = pgTable(
  'rowing_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    title: text('title').notNull(),
    sessionDate: date('session_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target of video's (club_id, session_id) key: a video can't point into another club's session.
    unique('rowing_session_club_id_id_unique').on(t.clubId, t.id),
    index('rowing_session_club_date_idx').on(t.clubId, t.sessionDate),
    tenantPolicy('rowing_session_tenant', t.clubId),
  ],
).enableRLS();

export const perspective = pgEnum('video_perspective', ['boat', 'bank', 'drone']);

/**
 * uploading → uploaded (bytes complete, looks like a video) → processing → ready | failed.
 * `rejected`: complete, but not a video; its bytes are deleted.
 */
export const videoStatus = pgEnum('video_status', [
  'uploading',
  'uploaded',
  'processing',
  'ready',
  'failed',
  'rejected',
]);

export const video = pgTable(
  'video',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    perspective: perspective('perspective').notNull(),
    /** Declared by the upload (tus Upload-Length) and reserved against the media cap from the start. */
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadedBytes: bigint('uploaded_bytes', { mode: 'number' }).notNull().default(0),
    status: videoStatus('status').notNull().default('uploading'),
    statusReason: text('status_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'video_session_fk',
      columns: [t.clubId, t.sessionId],
      foreignColumns: [rowingSession.clubId, rowingSession.id],
    }).onDelete('cascade'),
    index('video_session_idx').on(t.sessionId),
    tenantPolicy('video_tenant', t.clubId),
  ],
).enableRLS();
