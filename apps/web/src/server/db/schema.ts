import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  smallint,
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
    /** 0–100 while the worker processes it (#48). */
    processingProgress: smallint('processing_progress'),
    // Technical metadata from ffprobe (#47). Frame indices everywhere refer to the CFR renditions,
    // which keep the source's nominal rate fpsNum/fpsDen (ADR-0007).
    fpsNum: integer('fps_num'),
    fpsDen: integer('fps_den'),
    /** Display size, after rotation. */
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    frameCount: integer('frame_count'),
    codec: text('codec'),
    rotation: smallint('rotation'),
    /** The source had a variable frame rate; the renditions don't. */
    vfr: boolean('vfr'),
    /** `[{name, key, width, height, bytes, contentType}]`, written by the worker. */
    renditions: jsonb('renditions'),
    /** Counted against the media cap together with sizeBytes. */
    renditionsBytes: bigint('renditions_bytes', { mode: 'number' }).notNull().default(0),
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
    // Target of annotation's (club_id, video_id) key, like rowing_session's for video.
    unique('video_club_id_id_unique').on(t.clubId, t.id),
    tenantPolicy('video_tenant', t.clubId),
  ],
).enableRLS();

export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'dead']);

/**
 * Work for the Python worker (ADR-0008). Claimed through `rowlens_claim_job()` (SECURITY DEFINER:
 * RLS would show the worker one club at a time); everything after the claim runs in the job's club.
 */
export const job = pgTable(
  'job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: jobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text('locked_by'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastError: text('last_error'),
    /** e.g. `video.process:<videoId>`: enqueueing twice is a no-op. */
    idempotencyKey: text('idempotency_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('job_ready_idx').on(t.status, t.runAfter), tenantPolicy('job_tenant', t.clubId)],
).enableRLS();

/** What an annotation is: a text note (#59); line, arrow and angle drawings follow with #60. */
export const annotationKind = pgEnum('annotation_kind', ['note', 'line', 'arrow', 'angle']);

/**
 * Something said or drawn at one exact frame of a video (#59, #60). Frame indices refer to the CFR
 * renditions (ADR-0007). The author is a typed name while the pilot has no accounts (#84).
 */
export const annotation = pgTable(
  'annotation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    videoId: uuid('video_id').notNull(),
    frame: integer('frame').notNull(),
    kind: annotationKind('kind').notNull().default('note'),
    body: text('body').notNull().default(''),
    /** Drawings only: points normalised to 0–1 of the picture (#60). */
    shape: jsonb('shape'),
    authorName: text('author_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'annotation_video_fk',
      columns: [t.clubId, t.videoId],
      foreignColumns: [video.clubId, video.id],
    }).onDelete('cascade'),
    index('annotation_video_frame_idx').on(t.videoId, t.frame),
    check('annotation_frame_check', sql`${t.frame} >= 0`),
    check('annotation_body_check', sql`char_length(${t.body}) <= 2000`),
    check('annotation_author_check', sql`char_length(${t.authorName}) between 1 and 60`),
    tenantPolicy('annotation_tenant', t.clubId),
  ],
).enableRLS();
