import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { BOAT_CLASS_NAMES } from '../../shared/boats.ts';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  smallint,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
/**
 * On top of the club policy, what a rower may see or change (ADR-0013). Restrictive policies must
 * all pass; coaches, admins, the worker and the pilot path pass through `rowlens_sees_all()`.
 * The SQL helpers are defined in migration 0011.
 */
export function rolePolicy(
  name: string,
  command: 'all' | 'select' | 'insert' | 'update' | 'delete',
  rule: SQL,
) {
  return pgPolicy(name, {
    as: 'restrictive',
    for: command,
    to: appRole,
    ...(command === 'insert' ? {} : { using: rule }),
    ...(command === 'select' || command === 'delete' ? {} : { withCheck: rule }),
  });
}

/** Reading a training never implies permission to change it (#154). */
function resourcePolicies(name: string, read: SQL, write: SQL) {
  return [
    rolePolicy(`${name}_read`, 'select', read),
    rolePolicy(`${name}_add`, 'insert', write),
    rolePolicy(`${name}_edit`, 'update', write),
    rolePolicy(`${name}_delete`, 'delete', write),
  ];
}

const me = sql`rowlens_user_id()`;
const seesAll = sql`rowlens_sees_all()`;

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

/** A person can later belong to several clubs; authentication identity is global. */
export const appUser = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('nl'),
    /**
     * The member's own name and settings (2026-11-03), set in the account menu. The app role can't
     * read or write this table: `rowlens_my_profile` / `rowlens_set_my_profile` (migration 0016)
     * reach only the signed-in user's own row; `rowlens_club_members` shows names to the club.
     */
    firstName: text('first_name'),
    lastName: text('last_name'),
    /** The boat a new session starts with; null: C4x+. */
    defaultBoatType: text('default_boat_type'),
    language: text('language'),
    theme: text('theme'),
    notesVisible: boolean('notes_visible'),
    noteHoldSeconds: doublePrecision('note_hold_seconds'),
    driveMiddle: boolean('drive_middle'),
    settingsRevision: integer('settings_revision').notNull().default(0),
    settingsUpdatedAt: timestamp('settings_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('app_user_language_check', sql`${t.language} is null or ${t.language} in ('nl','en')`),
    check('app_user_theme_check', sql`${t.theme} is null or ${t.theme} in ('light','dark','hc')`),
    check(
      'app_user_hold_check',
      sql`${t.noteHoldSeconds} is null or ${t.noteHoldSeconds} in (0.5,1,2)`,
    ),
    check(
      'app_user_name_check',
      sql`(${t.firstName} is null or char_length(${t.firstName}) between 1 and 60) and (${t.lastName} is null or char_length(${t.lastName}) between 1 and 60)`,
    ),
    check(
      'app_user_default_boat_check',
      sql.raw(
        `default_boat_type is null or default_boat_type in (${BOAT_CLASS_NAMES.map((b) => `'${b}'`).join(', ')})`,
      ),
    ),
  ],
);

/** For the one-club pilot, allowlisted users get one membership in the pilot club. */
export const membership = pgTable(
  'membership',
  {
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    roles: text('roles')
      .array()
      .notNull()
      .default(sql`ARRAY['coach']::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('membership_club_user_unique').on(t.clubId, t.userId),
    index('membership_user_idx').on(t.userId),
    check('membership_roles_check', sql`rowlens_valid_roles(${t.roles})`),
    tenantPolicy('membership_tenant', t.clubId),
  ],
).enableRLS();

/** A short-lived, single-use e-mail code. Only HMAC output is stored. */
export const loginCode = pgTable(
  'login_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    userId: uuid('user_id').notNull(),
    codeHash: text('code_hash').notNull(),
    requestIpHash: text('request_ip_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: smallint('attempts').notNull().default(0),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'login_code_membership_fk',
      columns: [t.clubId, t.userId],
      foreignColumns: [membership.clubId, membership.userId],
    }).onDelete('cascade'),
    index('login_code_user_created_idx').on(t.userId, t.createdAt),
    tenantPolicy('login_code_tenant', t.clubId),
  ],
).enableRLS();

/** Revocable browser session; the random bearer token and CSRF token are stored only as hashes. */
export const userSession = pgTable(
  'user_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    csrfHash: text('csrf_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'user_session_membership_fk',
      columns: [t.clubId, t.userId],
      foreignColumns: [membership.clubId, membership.userId],
    }).onDelete('cascade'),
    index('user_session_user_idx').on(t.userId),
    tenantPolicy('user_session_tenant', t.clubId),
  ],
).enableRLS();

/**
 * A person in the club's roster (#104), rower or cox, with or without an account: coaches add them by
 * name so they can be put in a lineup and given notes before they ever log in. `userId` links the entry
 * to an account later (#110); `email` only helps that link. Entries are archived, not deleted.
 */
export const rower = pgTable(
  'rower',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    displayName: text('display_name').notNull(),
    email: text('email'),
    userId: uuid('user_id').references(() => appUser.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target of the (club_id, rower_id) keys of tables that point at a rower.
    unique('rower_club_id_id_unique').on(t.clubId, t.id),
    unique('rower_club_email_unique').on(t.clubId, t.email),
    unique('rower_club_user_unique').on(t.clubId, t.userId),
    check('rower_name_check', sql`char_length(${t.displayName}) between 1 and 60`),
    check('rower_email_check', sql`${t.email} = lower(${t.email}) and ${t.email} like '%_@_%'`),
    tenantPolicy('rower_tenant', t.clubId),
    rolePolicy(
      'rower_read',
      'select',
      sql`rowlens_roster_manager() or ${t.userId} = rowlens_user_id() or ${t.id} in (select rowlens_training_rower_ids())`,
    ),
    rolePolicy('rower_add', 'insert', sql`rowlens_roster_manager()`),
    rolePolicy('rower_edit', 'update', sql`rowlens_roster_manager()`),
    rolePolicy('rower_delete', 'delete', sql`rowlens_roster_manager()`),
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
    /** Boat class of the lineup (#103), one of shared/boats.ts; null until a lineup is set. */
    boatType: text('boat_type'),
    /** Who made it: a rower sees the sessions they created, even before a lineup (#40). */
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'rowing_session_boat_type_check',
      sql.raw(`boat_type in (${BOAT_CLASS_NAMES.map((b) => `'${b}'`).join(', ')})`),
    ),
    // Target of video's (club_id, session_id) key: a video can't point into another club's session.
    unique('rowing_session_club_id_id_unique').on(t.clubId, t.id),
    index('rowing_session_club_date_idx').on(t.clubId, t.sessionDate),
    tenantPolicy('rowing_session_tenant', t.clubId),
    rolePolicy(
      'rowing_session_role_read',
      'select',
      sql`rowlens_can_read_trainings() and (current_setting('app.training_permissions', true) = 'owner-or-staff' or ${seesAll} or ${t.createdByUserId} = ${me} or rowlens_session_reachable(${t.id}))`,
    ),
    rolePolicy(
      'rowing_session_role_add',
      'insert',
      sql`rowlens_roster_manager() or (rowlens_has_role('rower') and ${t.createdByUserId} = ${me})`,
    ),
    pgPolicy('rowing_session_role_edit', {
      as: 'restrictive',
      for: 'update',
      to: appRole,
      using: sql`rowlens_can_edit_session(${t.id})`,
      withCheck: sql`rowlens_can_edit_session(${t.id}) and rowlens_may_set_session_creator(${t.id},${t.createdByUserId})`,
    }),
    rolePolicy('rowing_session_role_delete', 'delete', sql`rowlens_can_edit_session(${t.id})`),
  ],
).enableRLS();

/**
 * Who sat where in a session (#103): seat 1 = bow … n = stroke, 0 = cox (shared/boats.ts). An empty
 * seat has no row. A rower sits in one seat per session; rowers are archived, never deleted, so the
 * key to `rower` restricts while deleting the session cascades.
 */
export const lineupSeat = pgTable(
  'lineup_seat',
  {
    clubId: uuid('club_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    seat: smallint('seat').notNull(),
    rowerId: uuid('rower_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'lineup_seat_pk', columns: [t.sessionId, t.seat] }),
    unique('lineup_seat_session_rower_unique').on(t.sessionId, t.rowerId),
    foreignKey({
      name: 'lineup_seat_session_fk',
      columns: [t.clubId, t.sessionId],
      foreignColumns: [rowingSession.clubId, rowingSession.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'lineup_seat_rower_fk',
      columns: [t.clubId, t.rowerId],
      foreignColumns: [rower.clubId, rower.id],
    }).onDelete('restrict'),
    index('lineup_seat_rower_idx').on(t.rowerId),
    check('lineup_seat_seat_check', sql`${t.seat} between 0 and 8`),
    tenantPolicy('lineup_seat_tenant', t.clubId),
    ...resourcePolicies(
      'lineup_seat_role',
      sql`rowlens_can_see_session(${t.sessionId})`,
      sql`rowlens_can_edit_session(${t.sessionId})`,
    ),
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
    /** 1, 2, 3… within its session, in upload order; fixed once given (display name). */
    seq: integer('seq'),
    /** When the recording started, from the file (Apple's creationdate first; see the worker). */
    recordedAt: timestamp('recorded_at', { withTimezone: true }),
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
    unique('video_session_seq_unique').on(t.sessionId, t.seq),
    tenantPolicy('video_tenant', t.clubId),
    ...resourcePolicies(
      'video_role',
      sql`rowlens_can_see_session(${t.sessionId})`,
      sql`rowlens_can_edit_session(${t.sessionId})`,
    ),
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
 * renditions (ADR-0007). Annotation display names remain typed separately from account identity.
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
    /** The account that wrote it (#40): rowers change only their own. Older notes have none. */
    authorUserId: uuid('author_user_id'),
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
    rolePolicy(
      'annotation_role_read',
      'select',
      sql`rowlens_can_see_moment(${t.videoId}, ${t.frame}) or ${t.authorUserId} = ${me}`,
    ),
    rolePolicy(
      'annotation_role_add',
      'insert',
      sql`rowlens_can_edit_video(${t.videoId}) and (${seesAll} or (${t.authorUserId} = ${me} and rowlens_can_see_video(${t.videoId})))`,
    ),
    // Coaches may change every note in a session they can see; rowers only their own (#108).
    rolePolicy(
      'annotation_role_edit',
      'update',
      sql`rowlens_can_edit_video(${t.videoId}) and (${seesAll} or ${t.authorUserId} = ${me} or rowlens_coaches_video(${t.videoId}))`,
    ),
    rolePolicy(
      'annotation_role_delete',
      'delete',
      sql`rowlens_can_edit_video(${t.videoId}) and (${seesAll} or ${t.authorUserId} = ${me} or rowlens_coaches_video(${t.videoId}))`,
    ),
  ],
).enableRLS();

export const strokeMarkKind = pgEnum('stroke_mark_kind', ['catch', 'half_slide', 'finish']);

/**
 * A coach's mark of a moment in the stroke (#85, ADR-0016): catch, finish and optionally the half
 * slide, for the whole boat, one per frame. Strokes and their timings are computed from these
 * (`shared/strokes.ts`); they are also the hand-labelled reference for automatic analysis later.
 * Whoever sees the video sees them; only coaches of the session (and the admin) change them.
 */
export const strokeMark = pgTable(
  'stroke_mark',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    videoId: uuid('video_id').notNull(),
    frame: integer('frame').notNull(),
    kind: strokeMarkKind('kind').notNull(),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'stroke_mark_video_fk',
      columns: [t.clubId, t.videoId],
      foreignColumns: [video.clubId, video.id],
    }).onDelete('cascade'),
    unique('stroke_mark_video_frame_unique').on(t.videoId, t.frame),
    check('stroke_mark_frame_check', sql`${t.frame} >= 0`),
    tenantPolicy('stroke_mark_tenant', t.clubId),
    rolePolicy('stroke_mark_role_read', 'select', sql`rowlens_can_see_video(${t.videoId})`),
    rolePolicy(
      'stroke_mark_role_add',
      'insert',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'stroke_mark_role_edit',
      'update',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'stroke_mark_role_delete',
      'delete',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
  ],
).enableRLS();

export const angleJoint = pgEnum('angle_joint', ['knee', 'hip', 'elbow', 'trunk']);

/**
 * A coach's angle measurement on a marked frame (ADR-0017): which rower, which joint, and the points
 * tapped (fractions of the picture: 3 for a joint, hip and shoulder for the upper body). The value
 * and the phase are computed from these and the stroke marks (`shared/angles.ts`). One per rower,
 * joint and frame: measuring again replaces it. Visible like the video; coaches change them.
 */
export const angleMeasure = pgTable(
  'angle_measure',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    videoId: uuid('video_id').notNull(),
    frame: integer('frame').notNull(),
    rowerId: uuid('rower_id').notNull(),
    joint: angleJoint('joint').notNull(),
    points: jsonb('points').notNull(),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'angle_measure_video_fk',
      columns: [t.clubId, t.videoId],
      foreignColumns: [video.clubId, video.id],
    }).onDelete('cascade'),
    // Rowers are archived, never deleted (a merge moves these first), so the key restricts.
    foreignKey({
      name: 'angle_measure_rower_fk',
      columns: [t.clubId, t.rowerId],
      foreignColumns: [rower.clubId, rower.id],
    }).onDelete('restrict'),
    unique('angle_measure_unique').on(t.videoId, t.frame, t.rowerId, t.joint),
    index('angle_measure_rower_idx').on(t.rowerId),
    check('angle_measure_frame_check', sql`${t.frame} >= 0`),
    tenantPolicy('angle_measure_tenant', t.clubId),
    rolePolicy('angle_measure_role_read', 'select', sql`rowlens_can_see_video(${t.videoId})`),
    rolePolicy(
      'angle_measure_role_add',
      'insert',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'angle_measure_role_edit',
      'update',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'angle_measure_role_delete',
      'delete',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
  ],
).enableRLS();

/**
 * The boat's line in a video (ADR-0017): two points, bow side first, that the upper-body angle is
 * measured against, so a tilted camera doesn't skew it and "forward" is known. Several per video,
 * each from its frame on, because a moving camera turns the boat in the picture (Ewout,
 * 2026-11-03); see `boatLineAt` in `shared/angles.ts`.
 */
export const videoBoatLine = pgTable(
  'video_boat_line',
  {
    clubId: uuid('club_id').notNull(),
    videoId: uuid('video_id').notNull(),
    frame: integer('frame').notNull().default(0),
    points: jsonb('points').notNull(),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'video_boat_line_pk', columns: [t.videoId, t.frame] }),
    check('video_boat_line_frame_check', sql`${t.frame} >= 0`),
    foreignKey({
      name: 'video_boat_line_video_fk',
      columns: [t.clubId, t.videoId],
      foreignColumns: [video.clubId, video.id],
    }).onDelete('cascade'),
    tenantPolicy('video_boat_line_tenant', t.clubId),
    rolePolicy('video_boat_line_role_read', 'select', sql`rowlens_can_see_video(${t.videoId})`),
    rolePolicy(
      'video_boat_line_role_add',
      'insert',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'video_boat_line_role_edit',
      'update',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'video_boat_line_role_delete',
      'delete',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
  ],
).enableRLS();

/**
 * The boat line found in every frame by the worker (ADR-0018): `frames[i]` is `[x0, y0, x1, y1,
 * confidence]` in fractions of the picture, left end first, or null where nothing convincing was
 * found. Which end is the bow comes from a coach's line or `bowSide`, set by a coach. A coach's own
 * line wins at its frame (`video_boat_line`). Written by the worker (`status`, `frames`); the coach
 * only sets `bowSide`.
 */
export const videoAutoBoatLine = pgTable(
  'video_auto_boat_line',
  {
    videoId: uuid('video_id').primaryKey(),
    clubId: uuid('club_id').notNull(),
    /** queued → running → done | failed; rerun whenever a coach changes a boat line. */
    status: text('status').notNull().default('queued'),
    frames: jsonb('frames'),
    detector: text('detector'),
    computedAt: timestamp('computed_at', { withTimezone: true }),
    bowSide: text('bow_side'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'video_auto_boat_line_status_check',
      sql`${t.status} in ('queued', 'running', 'done', 'failed')`,
    ),
    check('video_auto_boat_line_bow_side_check', sql`${t.bowSide} in ('left', 'right')`),
    foreignKey({
      name: 'video_auto_boat_line_video_fk',
      columns: [t.clubId, t.videoId],
      foreignColumns: [video.clubId, video.id],
    }).onDelete('cascade'),
    tenantPolicy('video_auto_boat_line_tenant', t.clubId),
    rolePolicy(
      'video_auto_boat_line_role_read',
      'select',
      sql`rowlens_can_see_video(${t.videoId})`,
    ),
    rolePolicy(
      'video_auto_boat_line_role_add',
      'insert',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
    rolePolicy(
      'video_auto_boat_line_role_edit',
      'update',
      sql`${seesAll} or rowlens_coaches_video(${t.videoId})`,
    ),
  ],
).enableRLS();

/**
 * A note as one thing (#105): the drawings and explanation at one frame of a video. Annotations stay
 * keyed by (video, frame); this row exists once something is attached to the note as a whole (its
 * rowers now, status #61 and sharing #112 later) and goes when the frame's last annotation goes.
 */
export const moment = pgTable(
  'moment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    videoId: uuid('video_id').notNull(),
    frame: integer('frame').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('moment_video_frame_unique').on(t.videoId, t.frame),
    // Target of the (club_id, moment_id) keys below.
    unique('moment_club_id_id_unique').on(t.clubId, t.id),
    foreignKey({
      name: 'moment_video_fk',
      columns: [t.clubId, t.videoId],
      foreignColumns: [video.clubId, video.id],
    }).onDelete('cascade'),
    check('moment_frame_check', sql`${t.frame} >= 0`),
    tenantPolicy('moment_tenant', t.clubId),
    ...resourcePolicies(
      'moment_role',
      sql`rowlens_can_see_moment(${t.videoId}, ${t.frame})`,
      sql`rowlens_can_edit_video(${t.videoId}) and rowlens_can_see_moment(${t.videoId}, ${t.frame})`,
    ),
  ],
).enableRLS();

/** Who a note is for (#105). Rowers are archived, never deleted, so that key restricts. */
export const momentRower = pgTable(
  'moment_rower',
  {
    clubId: uuid('club_id').notNull(),
    momentId: uuid('moment_id').notNull(),
    rowerId: uuid('rower_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    /** null on the pilot-code rollback path, which has no user. */
    assignedByUserId: uuid('assigned_by_user_id'),
  },
  (t) => [
    primaryKey({ name: 'moment_rower_pk', columns: [t.momentId, t.rowerId] }),
    foreignKey({
      name: 'moment_rower_moment_fk',
      columns: [t.clubId, t.momentId],
      foreignColumns: [moment.clubId, moment.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'moment_rower_rower_fk',
      columns: [t.clubId, t.rowerId],
      foreignColumns: [rower.clubId, rower.id],
    }).onDelete('restrict'),
    index('moment_rower_rower_idx').on(t.rowerId),
    tenantPolicy('moment_rower_tenant', t.clubId),
    ...resourcePolicies(
      'moment_rower_role',
      sql`rowlens_can_see_moment_id(${t.momentId})`,
      sql`rowlens_can_edit_moment(${t.momentId}) and rowlens_can_see_moment_id(${t.momentId})`,
    ),
  ],
).enableRLS();

export const momentShareScope = pgEnum('moment_share_scope', ['rower', 'crew']);

/**
 * Who a note is shared with (#112): one rower, or the whole crew of the session (its lineup).
 * Whoever shared it can take it back; so can a coach.
 */
export const momentShare = pgTable(
  'moment_share',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    momentId: uuid('moment_id').notNull(),
    scope: momentShareScope('scope').notNull(),
    /** Only for scope 'rower'. */
    rowerId: uuid('rower_id'),
    sharedByUserId: uuid('shared_by_user_id'),
    sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'moment_share_moment_fk',
      columns: [t.clubId, t.momentId],
      foreignColumns: [moment.clubId, moment.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'moment_share_rower_fk',
      columns: [t.clubId, t.rowerId],
      foreignColumns: [rower.clubId, rower.id],
    }).onDelete('restrict'),
    unique('moment_share_rower_unique').on(t.momentId, t.rowerId),
    // One "whole crew" share per note (rower_id is null there, and nulls never collide).
    uniqueIndex('moment_share_crew_unique')
      .on(t.momentId)
      .where(sql`${t.scope} = 'crew'`),
    check('moment_share_scope_check', sql`(${t.scope} = 'rower') = (${t.rowerId} is not null)`),
    index('moment_share_rower_idx').on(t.rowerId),
    tenantPolicy('moment_share_tenant', t.clubId),
    ...resourcePolicies(
      'moment_share_role',
      sql`rowlens_can_see_moment_id(${t.momentId})`,
      sql`rowlens_can_edit_moment(${t.momentId}) and rowlens_can_see_moment_id(${t.momentId})`,
    ),
  ],
).enableRLS();

export const momentRowerAction = pgEnum('moment_rower_action', [
  'assigned',
  'unassigned',
  'shared',
  'unshared',
]);

/** Append-only: who added or removed whom on a note, and when (#105 traceability). */
export const momentRowerLog = pgTable(
  'moment_rower_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull(),
    momentId: uuid('moment_id').notNull(),
    /** null for a share with the whole crew (#112). */
    rowerId: uuid('rower_id'),
    action: momentRowerAction('action').notNull(),
    byUserId: uuid('by_user_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'moment_rower_log_moment_fk',
      columns: [t.clubId, t.momentId],
      foreignColumns: [moment.clubId, moment.id],
    }).onDelete('cascade'),
    index('moment_rower_log_moment_idx').on(t.momentId, t.at),
    tenantPolicy('moment_rower_log_tenant', t.clubId),
    ...resourcePolicies(
      'moment_rower_log_role',
      sql`rowlens_can_see_moment_id(${t.momentId})`,
      sql`rowlens_can_edit_moment(${t.momentId}) and rowlens_can_see_moment_id(${t.momentId})`,
    ),
  ],
).enableRLS();

/**
 * Who may log in to a club, managed in the app by its admins (#42): e-mail and role. Server settings
 * (AUTH_ADMIN_EMAILS, AUTH_ALLOWED_EMAILS) add to this list; see auth/gate.ts for the order.
 */
export const clubAccess = pgTable(
  'club_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    email: text('email').notNull(),
    roles: text('roles').array().notNull(),
    addedByUserId: uuid('added_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('club_access_club_email_unique').on(t.clubId, t.email),
    check('club_access_roles_check', sql`rowlens_valid_roles(${t.roles})`),
    check(
      'club_access_email_check',
      sql`${t.email} = lower(${t.email}) and ${t.email} like '%_@_%'`,
    ),
    tenantPolicy('club_access_tenant', t.clubId),
  ],
).enableRLS();

export const clubAccessAction = pgEnum('club_access_action', ['added', 'role_changed', 'removed']);

/** Append-only: who admitted whom, changed a role or removed access, and when (#42, #43). */
export const clubAccessLog = pgTable(
  'club_access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    email: text('email').notNull(),
    action: clubAccessAction('action').notNull(),
    role: text('role'),
    roles: text('roles').array(),
    byUserId: uuid('by_user_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('club_access_log_club_at_idx').on(t.clubId, t.at),
    tenantPolicy('club_access_log_tenant', t.clubId),
  ],
).enableRLS();

/** Append-only administrative account changes; global identity, tenant-scoped authority. */
export const userSettingsAudit = pgTable(
  'user_settings_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => club.id),
    subjectUserId: uuid('subject_user_id').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    changedKeys: text('changed_keys').array().notNull(),
    roles: text('roles').array(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_settings_audit_club_at_idx').on(t.clubId, t.at),
    tenantPolicy('user_settings_audit_tenant', t.clubId),
    rolePolicy('user_settings_audit_read', 'select', sql`rowlens_has_role('admin')`),
    rolePolicy(
      'user_settings_audit_add',
      'insert',
      sql`rowlens_has_role('admin') and ${t.actorUserId} = rowlens_user_id() and exists (select 1 from membership m where m.club_id = ${t.clubId} and m.user_id = ${t.subjectUserId})`,
    ),
    rolePolicy('user_settings_audit_edit', 'update', sql`false`),
    rolePolicy('user_settings_audit_delete', 'delete', sql`false`),
  ],
).enableRLS();
