# BUILD

Technical implementation and architecture. Decisions are recorded in [docs/adr/](docs/adr/README.md);
this file summarises the current state.

## Users directory

With unified users enabled, `/users` is a distinct administrator navigation page. A persisted
platform administrator receives all verified accounts, including accounts with no memberships;
club administrators receive only the tenant-scoped member list. Selected-club role/admission
controls reuse the existing guarded operations. Other accounts have global profile/preference
editing without fabricated memberships or default club roles. Club administration holds Requests
and Roles; Clubs has lifecycle management without an embedded user settings editor.

The exact `/api/admin/users/:id/settings` route uses account context for persisted platform actors,
with protected read/save UUID-only auditing in its repository transaction. Ordinary club admins
still require a live selected-club context and target membership. No table or migration was needed;
accounts already support zero or more memberships. Global role assignment is now a protected RowLens-admin operation (ADR-0023); operator bootstrap remains the initial/recovery path.

## Full directory/editor and identity proof (ADR-0023)

`UsersPage` uses an allowlisted 17-field shared schema for filters, sort and bounded paging. The SQL
projection scopes members, memberships, activity and requests first; the server then filters/counts/
sorts/pages and derives club choices. Client generation guards and account/club/authority keys
prevent stale data or drafts crossing contexts. The table scrolls internally with sticky actions;
column selection and sort controls stay usable at phone size. `UserEditor` groups profile/preferences,
verified email changes, global authority and explicitly scoped club role/admission operations.

Migration 0024 adds protected global identity-change state (`scope_club_id` is authorization metadata,
not tenant ownership), hashed expiring attempt-limited proofs, owner-only proof views/confirmation,
authorized projections and serialized global-role changes. Null SQL arguments fail closed. Email
confirmation rechecks the initiator, identity revision and address reservations, locks affected clubs
in order, preserves IDs/roles/history, synchronizes grants and revokes old sessions/codes. Admission
forms bind the selected account ID; OTP verification, legacy adoption, provisioning, applications and
initial-admin writers coordinate identity/mailbox/admission locks to prevent stale email grants. Club admins
cannot confirm another account's change: its existing authenticated owner must use the mailed link.
Global RowLens identity administrators can confirm through the editor. Configured login addresses
cannot be renamed in the app; no server/local environment file was edited. Global directory/identity/
authority audits contain actor/target UUIDs and no email or code values.

No dependency was added. Paired unified-user flags retain feature-off compatibility. The local stack
has 25 migrations; unreleased function definitions were refreshed locally as verification hardened
them, without changing account data. Fresh database tests/rehearsal apply the migration directly.

## Club administration and archival (ADR-0022)

Club administration has member/role editing, pending-request decisions and historical mapping.
Unified member lists contain actual memberships, not unused allowlist entries. Clubs shows the
platform directory including archived clubs to RowLens administrators; ordinary accounts retain
club selection and applications. Protected platform GET/lifecycle operations enforce persisted
platform authority and audit archive/restore, with inline confirmation in NL/EN.

Migration 0023 adds club.archived_at and an owner-scoped active-club predicate to shared tenant RLS.
Account club selection/directory/applications and protected club-admin authorization also reject
archived clubs. Global lifecycle management can restore them without a selected active club.
Accounts, memberships, pending requests, media and history remain; existing background jobs may
finish. The local stack has 24 migrations. No production change was made.

## Unified-account transition (ADR-0021, local implementation)

Global OTP creates an account only after verifying inbox ownership. Protected account sessions and
pending membership applications are independent of a selected club; the existing OTP/IP limits,
CSRF/origin rules, cookie security and legacy sessions remain. Migration 0020 adds global protected
account tokens/codes/platform authority/audit and tenant-protected applications; 0021 adds canonical
account references to all five sporting/history tables. Migration 0022 adds restrictive membership/access policies, synchronized legacy-session adoption/revocation and canonical name updates. Platform SQL roles recheck persisted authority rather than trusting a request snapshot. Rower IDs remain compatibility identifiers
until every historical mapping is resolved; no historical people or references are deleted.

The club guard validates live per-club roles (or persisted platform authority), using an explicit
club UUID in API headers/media query parameters and captured upload headers. UI club selection is
per tab and opening a club reloads the page. Club content requests without explicit context are rejected when multiple clubs are available; account-only operations still have no membership requirement. Account preferences stay global. Platform elevation
uses protected persisted grants and the real actor; club administrators cannot grant it. The
operator bootstrap is `bash scripts/admin/grant-platform-admin.sh` (hidden terminal email prompt,
owner connection, already verified account, audited). Existing server admins remain club admins;
no automatic global promotion is performed.

The seeded pilot keeps its UUID/slug and is named WVIJburg. New clubs can be created/renamed and get
an initial administrator. Club admins approve/reject requests or admit an existing verified account;
approval and membership/grant updates are atomic. Rejected applications have a seven-day cooldown;
applicants can cancel pending ones. Direct admission resolves pending requests; revocation retains the account/other clubs and starts the same seven-day reapplication cooldown. Names/selectors derive from accounts. New seats/measurements/
assignment require rower role; direct sharing accepts any active verified club member. Legacy
identity linking has inline confirmation and refuses collisions without losing seats or measures.

Flags: server `UNIFIED_USERS=true`, client `VITE_FEATURE_UNIFIED_USERS=true`; the Docker build arg
`VITE_FEATURE_UNIFIED_USERS` also sets the runtime flag, off by default. Local dev runs with the
server flag; Vite development enables the UI. Production-image flag activation and platform
bootstrap need the separately authorized rollout. Logos and club theme selection are deferred;
existing theme tokens/global user preferences provide the later club-aware design boundary.

## Central user settings and role sets (2026-11-06, ADR-0019)

Migration `0018_admin_user_settings.sql` extends `app_user` with nullable language/theme/video
preferences, a revision and update time; scalar membership/access roles backfill to validated
singleton arrays. Unknown preferences remain null until explicitly saved/imported. No dependencies
or second identity register. Historical scalar access logs remain readable; new entries carry full
role sets. `user_settings_audit` is tenant scoped, admin readable and immutable to the app role.

Authentication resolves complete, live role arrays. `withTenant` sets transaction-local
`app.roles` and an explicit service marker; an authenticated missing role never becomes a worker.
The worker's `in_club` sets service mode explicitly. Existing session/note visibility remains;
roster read/write restrictions add coach/admin requirements, with crew names scoped to accessible
trainings. `rowlens_rower_targets` validates known sharing targets without exposing the directory.

Own preference and admin settings repositories use pinned definer functions inside `withTenant`.
Target membership and actual admin membership are checked against the current club, while settings
remain global to that account. Role changes/provisioning/settings writes share a per-club advisory
lock; the account row lock and revision protect cross-device edits. Global `app_user` access is
still denied to the app role. The existing own-profile endpoint accepts a revision; old clients'
explicit own-profile requests remain compatible and cannot write display/video preferences.

`client/settings/store.ts` binds cached preferences to user IDs, ignores stale account responses,
serializes explicit preference patches, reloads on conflicts, and refreshes on window focus.
Browser cache contains preferences/revision only, never profile names/e-mail. Logout clears active
account state immediately. Central preferences apply without remounting the player. Legacy device
values are never auto-imported: a member confirms once, and SQL fills only still-null keys. Admin
editing another user does not apply that user's theme/language to the admin interface.

## Repository layout

```
apps/web/            TypeScript web tier, one container (ADR-0004)
  src/server/        Fastify: config (zod), health/readiness, CSP, static SPA + fallback
  src/client/        React 19 SPA (Vite), React Router with basename `${BASE_PATH}/`
  src/shared/        code for both, incl. base-path.ts — single owner of /projects/rowlens (ADR-0003)
  e2e/               Playwright smoke against the built server
packages/            shared TS packages (contracts, i18n) — added in M0/M1
worker/              Python 3.12 (uv): probing, transcoding, analysis
  src/rowlens_worker/metrics/   analysis math; value-with-evidence or refusal
infra/compose/       dev compose (Postgres), edge stack, prod compose
docs/adr/            Architecture Decision Records
docs/analysis/       perspective validity rules
docs/privacy/        processors and data flows
scripts/github/      backlog/labels/milestones bootstrap
.github/             CI, release, templates, Dependabot
```

## Runtime architecture (proposed, ADR-0002…0008)

- `trustable-prod` (Hetzner CX32, 4 vCPU / 8 GB, 150 GB disk, 80 GB free), shared with trustable.nl and
  AudioScribe. Caddy (owned by trustable.nl) routes `/projects/rowlens/*` unchanged to `rowlens-web:3000`.
- Own Compose project `rowlens` in `/opt/rowlens`: `web`, `worker`, `db` (Postgres 16).
  Internal network for everything; only `web` joins `trustable_proxy`. CPU/memory limits on all services.
- Video bytes in `/opt/rowlens/media` behind `MediaStore` (keys, never paths; ADR-0006 amended: a
  directory, not MinIO), **hard-capped at 30 GB**; uploads pause at 85 % root-disk use. No video backup during the pilot (ADR-0006).
- Jobs: Postgres table with `SKIP LOCKED` + `LISTEN/NOTIFY`, consumed by the Python worker.
- Tenancy: app-layer policies + Postgres RLS; `club_id` on every tenant table; cross-club tests.
- Auth: e-mail OTP for an operator-managed one-club allowlist; invitations come after the one-club
  product is complete. `__Secure-rowlens_sid` is scoped to `Path=/projects/rowlens`.
- Playback: H.264 MP4 renditions with ~0.25 s GOP at the source frame rate (CFR), `requestVideoFrameCallback`
  for frame-exact stepping.

## Web tier details

- **One process**: Fastify serves `${BASE_PATH}/health/{live,ready}`, `${BASE_PATH}/api/*` (JSON 404 for
  unknown routes) and the built SPA. Page navigations (GET/HEAD with `Accept: text/html`) to any other
  path under the base get `index.html` (`no-cache`); `assets/*` is fingerprinted and `immutable`.
- **Base path is fixed at build time** (Vite `base`); `dist/client/build-info.json` records it and the
  server refuses to start if its `BASE_PATH` differs. The image takes `--build-arg BASE_PATH`.
- `PUBLIC_ORIGIN` is required in production (absolute links); config is validated once at startup.
- Security headers via `@fastify/helmet`: strict CSP (no inline script/style, `frame-ancestors 'none'`);
  HSTS is left to Caddy. `X-Request-Id` is accepted if well-formed, otherwise generated, and echoed.
- Readiness checks are pluggable (`ReadinessCheck[]`); with `DATABASE_URL` set, `db` is one of them.

## Sessions and upload (#44 minimal, #45, #46, #50)

- Tables `rowing_session` and `video` (both `club_id` + RLS; a video's `(club_id, session_id)` must
  match a session of the same club). Status: uploading → uploaded → (processing → ready | failed);
  `rejected` = complete but not a video (bytes deleted).
- API (all behind the authenticated tenant guard, `private, no-store`): `GET/POST /api/sessions`,
  `GET /api/sessions/:id` (with videos), `DELETE /api/videos/:id` (row + every byte under its key),
  `DELETE /api/sessions/:id` (session + cascaded videos/annotations + every video media directory).
- Session summaries and details show the chosen training date plus the database creation time in the
  viewer's local time (`Aangemaakt om 21:07` / `Created at 21:07`).
- Upload: our own tus 1.0 server (core + creation + termination) at `/api/uploads`, not
  `@tus/server` (its v2 converts requests and loses the per-request club context). Creation checks
  `Upload-Length` ≤ 4 GB, type/extension, the session (RLS), 60 creations/h per IP, disk < 85 %, and
  reserves the size against the 30 GB cap under `pg_advisory_xact_lock` (via SECURITY DEFINER
  `rowlens_media_bytes()`, since RLS shows one club). PATCH: ≤ 64 MB per request, offset must match
  the file on disk (the file is the truth after a crash), one PATCH per upload at a time. On the last
  byte, magic bytes decide uploaded vs rejected; ffprobe follows in the worker (#47).
- Client: tus-js-client, 16 MB chunks, retries only what a new attempt can fix, resumes a file chosen
  again on the same device (fingerprint in localStorage), keeps the screen awake and warns before
  leaving while uploading. Camera position (boat/bank/drone) per file.
- Media: `MediaStore` (`server/media/store.ts`), keys `clubs/{club}/videos/{video}/original`;
  `MEDIA_DIR` (prod `/media` = `/opt/rowlens/media`; dev `apps/web/.media`).

## Worker: probe and transcode (#47, #33, ADR-0007/0008)

- Python 3.12 (`worker/`), psycopg 3, ffmpeg from Debian in the image; runs as uid 1000 with
  `MEDIA_DIR=/media` (same bind mount as web) and `DATABASE_URL` as `rowlens_app`.
- Loop (`python -m rowlens_worker`): `rowlens_claim_job` → handler → succeed / fail (backoff) / dead;
  LISTEN `rowlens_jobs` + 5 s poll; SIGTERM releases the running job. JSON log lines.
- `video.process`: ffprobe → metadata on `video` (fps_num/den, display size, duration, frame count,
  codec, rotation, vfr) → one ffmpeg run writing `renditions/play-1080` and `renditions/play-540` in a
  `work/` dir, then the poster from play-540 → rename into place → `status = ready`, `renditions`
  JSON, `renditions_bytes` (counted against the cap). play-1080 only for sources ≥ 720p; capped
  CRF (`-maxrate` ≤ 1.5 × the source bitrate, ceilings 8 / 2.5 Mbit/s at 30 fps). Progress (0–95 %) and lease renewal every 5 s.
  A video deleted mid-way: its bytes are removed at the end.
- Limits on the shared server: container 2 CPUs / 2 GB, ffmpeg `nice -n 10` and 2 threads.
- UI: the session page shows "Processing n %", then `60 fps · 1920×1080 · 2:03`, or why it failed;
  it refreshes every 3 s while a video of the session is uploaded/processing.
- Tests: pytest for probe parsing (iPhone rotation/VFR, Android 90000/1, slow-mo, refusals), ffmpeg
  arguments (CFR, GOP, closed GOP, no metadata, renditions per size), keys, backoff; vitest for the
  queue contract; the edge E2E uploads a clip and waits for "Ready" from the real worker.

## Player on the club's own videos (#49, #52)

- `GET /api/videos/:id`: facts for the player (fps as num/den, frame count, size, renditions by name
  and size; never storage keys). `GET /api/videos/:id/media/{play-1080|play-540|poster}`: after the
  guard and an RLS read of a `ready` video, streamed from the media dir with single byte ranges
  (206/416; several ranges → the whole file), `private, max-age=3600`. The key in the renditions
  JSON must lie under the video's own folder, or it's a 404.
- `/videos/:id` page: `Player` with the poster; play-540 first on narrow screens or slow/saving
  connections, else play-1080; a 540p/1080p switch remounts the player at the same frame
  (`startFrame` / `onFrame` props). Session list: poster thumbnails link to the player.
- Edge E2E plays the H.264 rendition in Google Chrome (`channel: 'chrome'`; open-source Chromium
  has no H.264) and steps 10 frames exactly.

## Local development (iterate on the laptop)

- `pnpm dev:up`: Postgres (127.0.0.1:5434) and the worker (production image, ffmpeg inside) from
  `infra/compose/docker-compose.dev.yml`, then the migrations. The worker shares `apps/web/.media`
  with the web app through a bind mount.
- `pnpm dev`: `dev:server` (Fastify on API_PORT 3100, `--watch`) and `dev:client` (Vite on DEV_PORT
  5174, hot reload, proxying `/api` and `/health`). Ports come from `apps/web/.env` and avoid the
  local trustable.nl stack (5173, 5433). API_PORT wins over PORT in the server config, because the
  preview pane and Vite set PORT for the front end.
- `.claude/launch.json` `rowlens` runs `pnpm dev` in the browser pane.

## Video page layout (BUG-005, Ewout's laptop feedback)

- Stage: `--aspect` (video width/height, set inline from metadata) and `--stage-cap`; width =
  min(column, cap × aspect), `aspect-ratio: var(--aspect)`, video absolutely positioned inside with
  `object-fit: contain`. Phones: cap 60dvh. Full screen: the stage takes the free grid row.
- ≥ 1000 px: two columns, the player (sticky) left and the notes (own scroll) right. Landscape video:
  cap = 100dvh − 330px (the control row on two rows), − 280px from 1360 px (one row); the player
  column then fits the screen once scrolled to the top. Portrait video (`aspect < 0.9`, from the
  worker's display size): three zones, the video at cap = 100dvh − 130px with an absolute width, its
  tools and controls in a column beside it, notes right. Phones: stacked.
- Mockup 1e (2026-11-03): header with back link, title and facts left, the lineup as columns right
  (`LineupSummary`, a `dl`); the page's tools (`toolbar` prop: draw, notes on video, hold, quality)
  in one row **above** the picture on a laptop and below the controls on a phone; markers as
  diamonds above the track, then the readout; the control row speed | steps around a round play
  button | loop and full screen (container query on the player: one row from 880 px, three rows
  under 520 px); a line of keyboard shortcuts on laptops (`keyHints` adds the page's own, e.g. N),
  hidden on touch screens and below 640 px high. The "Notes for" filter sits in the notes column
  header and drives both the list and the video. Full screen is a flex column.
- Checked: Chrome at 1000×540, 1440×860 and 1920×1000 (landscape and portrait: video, controls and
  note field in one view; portrait video 231×410 / 411×730 / 489×870); iPhone 13 in WebKit.

## Confirmations

- No browser popups (`window.confirm`): deleting a session, note, drawing or video asks in the page,
  where it was clicked (`client/ui/ConfirmInline.tsx`: question + "Ja, verwijderen" / "Annuleren";
  focus on yes, Esc cancels; compact "Ja / Nee" inside a drawing chip). One open at a time.

## Video names (Ewout, 2026-11-01)

- Shown as `[session]-[#]-[start]-[length]`, e.g. `Zaterdag CX4+-2-09:48-1:27`
  (`client/sessions/displayName.ts`); unknown parts are left out (Ewout, 2026-11-03: no question
  marks), e.g. `Zaterdag CX4+-2-1:27` for a phone export without a start time. The
  original file name shows only while a video uploads or when it is refused (2026-11-03).
- `video.seq`: 1, 2, 3… per session in upload order, given at upload creation (under the creation
  lock) and never renumbered; unique per session. Migration 0005 numbers existing videos.
- `video.recorded_at`: the worker reads Apple's `com.apple.quicktime.creationdate` first (filming
  start, with its offset), then `creation_time` (on iPhones often the export/send time: 18:08 the
  next day for a clip filmed at 09:48); 1904/1970 and zone-less values are ignored. Videos
  processed before this have none until re-uploaded.

## Drawings at a frame (#60)

- Same `annotation` table: kinds `line`, `arrow` (2 points), `angle` (3: arm, vertex, arm), points as
  fractions of the picture in `shape.points`; the API validates the count and 0–1 per kind.
- `DrawingLayer`: an SVG in the player's stage (`overlay` prop) with the picture's display size as
  viewBox and `preserveAspectRatio="xMidYMid meet"` — the same scaling as the video's
  `object-fit: contain`, so drawings sit on the picture at any size, with bars, in full screen. It
  catches taps only while a tool is on (`touch-action: none` then). Angles are measured in picture
  pixels (`drawing/geometry.ts`), shown with an arc and degrees; yellow with a dark halo.
- Tools (Lijn/Pijl/Hoek) in the player's toolbar under the controls — close to the picture on a
  phone — and choosing one pauses and scrolls the picture into view; Esc or the same button stops.
  The signed-in account supplies the author. Drawings show on their frame and during the configured
  playback hold, and are deleted (not edited).
- The list has **one section per frame** (`notes/moments.ts`): its drawings as small chips ("Hoek
  128°" ×) and an **always-open explanation field** (the frame's note: Save appears once changed;
  saved empty, it is removed). Clicking anywhere in a section seeks there without scrolling; its
  Frame link also brings the video into view. The section of the frame on screen is selected
  (`aria-current`, orange). A frame without a section gets the field at the top. The account name is
  shown read-only above the list. One marker per frame. Storage: one row per drawing/note.
- "Notitie verwijderen" deletes a whole section: `DELETE /api/videos/:id/frames/:frame/annotations`
  removes every drawing and remark at that frame in one transaction (404 if nothing there).

## Notes pinned to a frame (#59)

- Table `annotation` (`club_id` + RLS; `(club_id, video_id)` must match a video of the same club, cascade
  on video delete): `frame`, `kind` (note now; line/arrow/angle with #60), `body` ≤ 2000, `shape`
  (drawings), `author_name` 1–60, `author_user_id`, timestamps. For signed-in accounts the server
  ignores any client-supplied author and stores the linked roster name, else the account display name;
  the rollback-only pilot path still requires a typed label.
- API: `GET/POST /api/videos/:id/annotations` (POST only on a `ready` video, `frame < frame_count`),
  `PATCH/DELETE /api/annotations/:id`. Signed-in members of the one pilot club may edit/delete.
- UI: notes panel beside/under the player (writing pauses the video; the note goes at the current
  frame), list in frame order (tap → frame, notes on this frame highlighted), markers above the scrub
  bar (`Player` props `markers`, `handle`).

## Notes in the video (#106)

- `notes/overlay.ts` groups annotations per frame and keeps the latest moment in the picture for a
  per-device 0.5/1/2-second hold. The default is one second. Its text card chooses the corner furthest
  from sampled drawing points; the black backdrop and gold author label stay readable on any footage.
- The eye button and keyboard `N` show/hide annotations and remember the choice. The player filter and
  notes-panel filter share one state: all notes, the signed-in rower's own assigned notes, or a chosen
  rower. Hidden/filtered moments also disappear from the timeline markers.
- `VideoNotesOverlay` and the existing `DrawingLayer` both live inside `.player__stage`, so they scale
  with portrait/landscape video and remain present in native fullscreen and the iPhone immersive
  fallback. Drawing mode still shows the exact frame's shapes even when playback notes are off.

## Sessions list, header and admin panel (#108)

- After login `/` goes to `/sessions`. Every signed-in page has `ui/AppHeader.tsx` (Sessions, Rowers,
  Admin for admins, account menu with display mode and sign-out), rendered by `RequireAuth`
  (`role="admin"` guards `/admin`).
- `GET /api/sessions` adds `lineup`, `mySeat` and `notesForMe`; the page filters and sorts on the
  client (`sessions/filter.ts`: period, rower, boat, title words, notes for me; five sorts). The page
  owns the filters and mirrors them into the URL (inputs bound straight to the URL lag on phones).
- Visibility/editing: ADR-0020 and migration 0019 supersede the old own/reachable-only scope.
  All club members read all trainings; only the creator (existing rower rights) and any club
  coach/admin may edit. Only admins reassign creators; ownerless sessions are staff-editable.
- Admin panel `/admin`: tabs Users (access list) and Roles (what each role sees and may do).

## What a rower sees, and sharing notes (#40, #112, ADR-0013)

- `withTenant` sets validated additive `app.roles` and an explicit service flag (ADR-0019).
  Migration 0019 separates restrictive SELECT/INSERT/UPDATE/DELETE policies for session, video,
  lineup and moment resources. `rowlens_can_read_trainings` grants member club reads;
  `rowlens_can_edit_session/video/moment` restrict mutations to the creator or coach/admin.
  New handlers opt in with fixed transaction context `app.training_permissions=owner-or-staff`.
  Missing context retains pre-#155 visibility and corresponding write scope for an old image still
  serving during migration or after an authorized rollback. Unknown values deny training access;
  this context is never accepted from request input. The session read policy uses its row columns
  directly so INSERT RETURNING can see a just-created session, without a stable self-lookup.
  Tenant policies and same-club parent foreign keys still apply. `rowlens_sees_all` remains
  admin/service-only so general read access cannot unlock privileged operations.
- Note visibility remains private for rowers unless authored/assigned/shared to them; coaches/admins
  see all club feedback. Annotation authorship also requires an editable parent for mutations.
  APIs return `canEdit` for sessions/videos/annotations; the read-only UI hides all mutations and
  renders crew/assignment/share names statically. Playback and own preferences stay available.
- Media mutations lock the editable parent session before file operations, then recheck permission
  in a fresh SQL statement after acquiring the lock (including any wait for creator transfer).
  Upload streaming/progress/job creation share that transaction. For a chunk, disable the normal
  15-second idle-transaction limit locally and bound its stream to five minutes; delete handlers remove files only
  after a successful database deletion. Crew lookups for read-only viewers expose actual crew names,
  no e-mails, and identify only the current member with `mine`.
- `moment_share` (scope `rower` or `crew`) and `PUT /api/videos/:id/frames/:frame/shares {rowerIds,
  crew}`; a rower takes back only their own shares (403 `not_yours`), changes go to
  `moment_rower_log` (`shared`/`unshared`).
- Login links a roster entry with exactly the account's e-mail (`rowlens_auth_ensure_user`);
  `/api/auth/status` says `user.linked`, and an unlinked rower sees a hint on Sessions.
- `server/auth/can.ts`: the API's own permission rules, unit-tested for every role × action.

## Admin: who may log in (#42)

- Roles on `membership`: `rower | coach | admin`. Login (`auth/gate.ts` `roleFor`) decides access and
  role in this order: `AUTH_ADMIN_EMAILS` (server, always admin, not editable in the app) → the
  in-app list `club_access` (RLS) → `AUTH_ALLOWED_EMAILS` (server, coach). Anyone else: the same 202,
  no code. `rowlens_auth_ensure_user` sets the membership role on every code request;
  `rowlens_auth_session` returns it, the guard puts it on `req.role`, `/api/auth/status` on `user.role`.
- API `api/access.ts` (admins only, 404 otherwise): list (both sources, with last activity through
  `rowlens_club_members()`, which only sees the current club), add (+ bilingual invitation mail;
  access stays if the mail fails), change role, remove (deletes the membership, so sessions and codes
  end by cascade). Refuses changing your own access and removing the last admin. Every change goes to
  the append-only `club_access_log`.
- UI: `client/admin/AccessPage.tsx` (`/admin`), linked on the home page for admins only.
- What rowers and coaches may do otherwise is still the same; that's #40.

## Who a note is for (#105)

- Table `moment` (`club_id` + RLS): the note at one frame of a video as one row, `unique(video_id,
  frame)`, cascade from the video. Created on the first assignment; deleted with the frame's last
  annotation (`dropEmptyMoments`). Annotations stay keyed by `(video_id, frame)`.
- `moment_rower` (who it is for; key to `rower` restricts) and the append-only `moment_rower_log`
  (`assigned`/`unassigned`, by user, at).
- API `api/moments.ts`: `PUT /api/videos/:id/frames/:frame/rowers {rowerIds}` replaces the set (409
  without anything at the frame; unknown or other-club rower 400; archived only if already assigned).
  `GET /api/videos/:id/annotations` includes `moments: [{frame, rowers}]`. Merging rowers moves them.
- UI: in each note section "For:" a chip per lineup seat ("Boeg (1) · Anna") that turns that rower
  on or off with one tap, "Whole crew" as a switch (adds the missing crew; when the whole crew is on,
  takes it off and keeps others), anyone outside the lineup as a chip with ×, and a `RowerPicker`
  to add them (mockup 1e, 2026-11-03; `toggleRower` / `toggleCrew` in `notes/assignees.ts`).
  The "Notes for" filter sits in the notes column header.

## UI style and colour modes (ADR-0014)

- `apps/web/src/client/design/`: `classical.css` (the Classical system's `styles.css` without its
  Google Fonts `@import`; source hash and update steps in `design/README.md`), `theme.css` (semantic
  tokens on top, plus our dark and high-contrast modes), `LICENSES.md`. Fonts from `@fontsource`
  (Cormorant Garamond, Lora), imported in `main.tsx` before the design files and `styles.css`.
- Icons: `client/ui/icons.tsx` (`<Icon name=…>`, a few Lucide paths; decorative unless `label`).
- `styles.css` binds to the semantic tokens; RowLens's own values are `--rl-draw*` (drawings) and
  `--rl-here*` (the frame on screen). Controls keep 44 px touch targets and 16 px input text.
- Contrast: `src/server/ui-theme-contrast.test.ts` reads both CSS files and checks text pairs in light,
  dark and high contrast against WCAG AA.
- Colour mode: `client/ui/theme.ts` (saved per device, light by default) and `ThemeSwitch` (home page
  and account menu) set `data-theme="dark"|"hc"` on `<html>`; applied before the first render.
- Sessions list (mockup 1d): `sessions/filter.ts` `groupByMonth` (one table per month when sorted by
  date, otherwise one table) and `crewText` ("Anna, Tom · cox Lieke"). The whole row opens the session;
  the title is the link for keyboards. Below 760 px each row is a stacked block.

## Stroke marks (#85, ADR-0016)

- Table `stroke_mark` (`club_id` + RLS; migration 0013): `video_id`, `frame` (CFR), `kind`
  (`catch` | `half_slide` | `finish`), one per frame (`unique(video_id, frame)`), cascade with the
  video. Read: `rowlens_can_see_video`; write: `rowlens_sees_all() or rowlens_coaches_video`.
- API `api/strokes.ts`: `GET /api/videos/:id/strokes`, `PUT /api/videos/:id/strokes/:frame {kind}`
  (sets or changes; 409 not ready, 400 outside the video), `DELETE …/:frame`; `can(mark_strokes)`
  (admin, coach, pilot path) or 403.
- `shared/strokes.ts`: `strokesFrom(marks, fps)` → strokes (catch → next catch) with rate, drive,
  recovery, ratio as `Measured` (value + evidence frames, or a refusal), half slide on drive and
  recovery as marked, averages from 3 complete strokes, marks before the first catch as `loose`;
  `neighbourCatch` for ↑ / ↓.
- UI: side column tabs Notes | Strokes (both stay mounted). The Strokes tab has the mark buttons
  (coaches) for the frame on screen, the averages, and a table per stroke (jump, loop catch → next
  catch via the player handle's `setLoop`). Keys I / H / U mark (the same key again removes), ↑ / ↓
  jump between catches. On a strip under the note markers (out of the tab order): the catch an arrow
  down, the finish an arrow up, a marked half slide a tick, and (when turned on in the Strokes tab,
  per device, `strokes/preferences.ts`) the calculated middle of each drive as an open circle, unless
  the coach marked a half slide on that drive (ADR-0016 addendum). Low laptop
  screens (≤ 640 px high) get a 48 px play button so the player column still fits.

- **Inline moment removal (2026-11-06)**: each coach/admin stroke row has a trash action beside
  its loop button. It expands that row's stored moments (including ambiguous duplicate finishes);
  choose one moment, then confirm its kind/frame inline. The next catch belongs to the next row.
  Loose marks remain directly removable, even without any catches. No separate expandable editor.
  `changeMark(frame, null)` reuses the existing protected DELETE route; failures retain the mark.
- **Frame tools (2026-11-06)**: ↓ Catch / ↑ Finish immediately above the picture, including on
  phones, with Notes open and in fullscreen. They pause playback, cancel point placement and
  toggle the kind on the current frame; selected state follows the frame's stored mark. They use
  `PressButton` for pointer-release and keyboard activation. Half slide and I/H/U remain in Strokes.
- Table columns are constrained so an expanded editor cannot widen/scroll the table. New delete,
  loop and frame actions have 44 px targets; selected fullscreen frame tools use the light drawing
  colour with dark text, and unselected tools use light text. No schema, API or role changes.

## Angles per phase (ADR-0017)

- Tables `angle_measure` (`rower_id`, `joint` knee | hip | elbow | trunk, `points` jsonb, one per
  video × frame × rower × joint) and `video_boat_line` (2 points, bow side first), migration 0014,
  RLS like `stroke_mark`. `rowlens_merge_angle_measures(from, into)` (definer, current club only) is
  called by `mergeRowers`.
- API `api/angles.ts`: `GET /api/videos/:id/angles` → measures + boat line; `PUT …/angles`
  (only on a frame with a stroke mark, else 409 `no_stroke_mark`; active roster rower, else 400);
  `DELETE /api/angles/:id`; `PUT` / `DELETE /api/videos/:id/boat-line`; `can(measure_angles)`.
- `shared/geometry.ts` (moved from the client: `toPixels`, `angleDegrees`); `shared/angles.ts`:
  `measureValue` (inner angle, or upper-body lean against the boat line, forward positive),
  `phaseOf`, `angleTables` (per joint, rower × phase: mean, n, min–max, frames; crew range).
- Boat lines per moment (migration 0015): `video_boat_line` keyed by (video, frame); `boatLineAt`
  picks the line for a frame; `PUT /api/videos/:id/boat-line {frame, points}`,
  `DELETE /api/videos/:id/boat-line/:frame`.
- Touch drawing (`drawing/DrawingLayer.tsx`): points on a short still tap (`isTap`), draggable
  handles within a fingertip (`HANDLE_REACH`, `dragPoint`, half speed for touch), and a confirm bar
  (Save / Start over / Cancel) over the picture; Enter / Backspace / Esc.
- UI: third side tab Angles (`angles/AnglesPanel.tsx`): boat line, measuring on a marked frame
  (rower chip + joint, then taps through `DrawingLayer` with `angle` or `line`), measurements on this
  frame, a table per joint. On the picture: measurements of the frame on screen with their label,
  and the boat line dashed while the tab is open. `Drawing` got `label` and `variant`.
- **Boat line found per frame (ADR-0018)**: worker job `video.boat_line` (`video/boat_line.py`)
  decodes the smallest rendition through ffmpeg at 480 px on the long side and runs
  `analysis/waterline.py` (OpenCV top-hat hull mask → crewed, lowest region → robust line through its
  lowest pixels → ends walked to the tips or the picture's edge; followed frame to frame, restarted
  from coach lines). Queued by `process_video` when a video is ready, by migration 0017 for existing
  ones, and by the API after every boat line change (one queued run per video). Stored in
  `video_auto_boat_line` (`frames`: `[x0, y0, x1, y1, confidence] | null` per frame, `status`,
  `detector`, `bow_side`). API: `GET /api/videos/:id/auto-boat-line`,
  `PUT /api/videos/:id/auto-boat-line/bow-side`. `shared/angles.ts`: `resolveBoatLine` (coach on
  its frame → found line, bow side from the nearest coach line or `bow_side` → coach line from
  before) and `measureAt` (upper body refused `no_bow_side` until the bow is known). Client: found
  line dotted (`variant: 'auto'`), status and bow choice in the Angles tab, the page polls every 5 s
  while the worker is busy. Build flag `AUTO_BOAT_LINE` (off with
  `VITE_FEATURE_AUTO_BOAT_LINE=false`). E2E clip `e2e-boat.webm` (drawn hull) from
  `scripts/demo-media/generate.sh`.

## Drawing controls without covering the picture (2026-11-05)

- `Player.drawingControlsRef` exposes a control-strip host directly after the stage. `VideoPage`
  supplies it to `DrawingLayer`, which portals its existing rower/joint/Save/Redo/Cancel controls
  there. It remains inside native fullscreen and the iPhone immersive fallback; drawing state and
  save APIs stay the same. Control pointer events stop before reaching the stage's pan handlers.
- Empty strips take no space. Buttons and selects have 44 px targets; selects use an explicit
  height because native WebKit controls ignored `min-height` alone.
- Point placement is direct (BUG-024): a tap shows a point/ring immediately. The control strip,
  including measurement attributes, appears only once all two/three points exist; no point-counter
  menu appears between taps. Adjusting, saving, restarting and cancelling still work afterwards.
- `pnpm --filter @rowlens/web e2e:editing` runs drawing, angles, boat-line and playback E2E on the edge stack:
  Chrome 1440×900, Chrome 1000×540 and iPhone 13 WebKit. Selection taps use native touch where
  supported; dragging uses the mouse API because Playwright's public touchscreen API exposes only
  taps. A physical iPhone drag check is still needed.

## Playback activation after drawing (BUG-022, 2026-11-05)

- `ui/PressButton.tsx` activates speed and play/pause controls on a primary-pointer release inside
  the button. It does not require the compatibility mouse click after a touch gesture, ignores that
  later click to avoid double activation, and preserves keyboard/assistive clicks (`detail = 0`).
  A cancelled pointer or one leaving the control does not activate it.
- Drawing drags explicitly release pointer capture on up/cancel; lost capture cancels an abandoned
  drag. Save APIs and speed arithmetic are unchanged.
- `e2e/playback.spec.ts` measures the actual H.264 media clock at 0.25×/0.5× after drawing, selection
  and point movement, then checks pause stability. It also models a missing compatibility click
  and checks keyboard activation. The model reproduces the reported inactive button, but the
  original physical iPhone gesture still needs confirmation.

## Names, default boat and the session page (2026-11-03)

- `app_user.first_name`, `last_name`, `default_boat_type` (migration 0016), through
  `rowlens_my_profile()` / `rowlens_set_my_profile()` (own row only; also sets `display_name`).
  `GET /api/auth/status` returns them; `PUT /api/me/profile` (`api/profile.ts`) sets them.
- `RequireAuth` shows a welcome card with the name form until both names are set; the account menu
  holds the same form (`ui/ProfileForm.tsx`) with the default boat (null: C4x+, `DEFAULT_BOAT`).
- Sessions: `creatorName` (name, else e-mail, via `rowlens_club_members()`) in the list and on the
  page; "Created on 2 Nov at 09:12" (`formatCreatedDay`); `POST /api/sessions` takes `boatType`;
  `PATCH /api/sessions/:id {title}` with `can(rename_session)` (its coaches, the admin, the maker).
- Session page order: title (rename), facts, **Videos** (list + "Add videos" button, the upload queue
  in the same card), the **lineup** folded in a `<details>` with a summary, then delete.

## Interface language (ADR-0015)

- `client/i18n/language.ts`: `lang()` (saved choice per device, else Dutch), `locale()` for `Intl`,
  `setLanguage()` (saves, sets `<html lang>`, notifies) and `useLanguage()`. `App` subscribes, so a
  switch re-renders everything without remounting. Every `*Strings()` and formatter reads `lang()`;
  nothing reads `navigator.language` any more.
- `ui/LanguageSwitch.tsx` on the home page and in the account menu. The language list is
  `shared/languages.ts`, shared with the server: `POST /api/auth/otp` takes `language` and sends the
  code mail in it (default Dutch).

## Club roster (#104)

- Table `rower` (`club_id` + RLS): a person who rows or coxes, **with or without an account**.
  `display_name` 1–60, optional `email` (lower-case, unique per club, only for linking an account later
  in #110), `user_id` (null until #110), `archived_at` (archived rowers stay in old lineups but can't be
  picked). `unique(club_id, id)` is the target of the `(club_id, rower_id)` keys of tables that point at
  a rower, so a reference can never cross clubs.
- API `apps/web/src/server/api/rowers.ts`: list (`?archived=include|only`), add, edit/archive, merge.
  Adding a name that looks like an existing one returns **409 `similar` with candidates** unless
  `confirmNew` is set: `shared/names.ts` (`similarNames`: equal ignoring accents/case/spaces, one name
  contained in the other as whole words, or 1–2 letters apart). Merge moves every reference to the kept
  entry in one transaction (`mergeRowers`; lineups add their step in #103), keeps a missing e-mail.
- UI: `client/rowers/RowersPage.tsx` (`/rowers`) and `RowerPicker.tsx`, a combobox that searches the
  roster as you type (`nameMatches`) and offers "add ‘name’" inline, with the same similar-name question.
  Reused by lineups (#103), note assignment (#105) and sharing (#112).
- Permissions: every signed-in club member may edit the roster during the one-club phase (roles: #40).

## Session lineup (#103)

- `rowing_session.boat_type` (check against `shared/boats.ts`: coastal `C1x, C2x, C2x+, C4x+, C4+` first,
  then flat-water classes) and table `lineup_seat` (`club_id` + RLS): seat 1 = bow … n = stroke, 0 = cox;
  PK `(session_id, seat)`, a rower once per session. Keys `(club_id, session_id)` → session **cascade**,
  `(club_id, rower_id)` → `rower` **restrict** (rowers are archived, never deleted).
- API `apps/web/src/server/api/lineups.ts`: `PUT /api/sessions/:id/lineup` replaces the whole lineup in
  one transaction (seats checked against the boat; unknown rower → 400; an archived rower may stay in a
  seat they already had but can't be seated anew); `GET /api/lineups/recent` for "copy from an earlier
  session". Session detail, session list and video detail include `boatType`/`lineup`. Merging two
  roster entries moves their seats (`mergeLineupSeats`).
- UI: `client/lineup/LineupCard.tsx` on the session page (boat, a `RowerPicker` per seat, copy, one
  save button that appears on change; the draft only resets when the saved lineup changes, not on the
  3 s refresh while videos process) and `LineupSummary` under the video title. Per-video changes
  (seat swaps during a session) are not modelled yet.

## E-mail OTP authentication (#28–#30, ADR-0011)

- The first club is operator-managed through `AUTH_ALLOWED_EMAILS`; requesting a code always returns
  the same 202 response. The six-digit CSPRNG code is HMAC-SHA256 stored, valid for 10 minutes, single
  use and locked after five failures. Previous unused codes are invalidated.
- Rate-limit buckets are in Postgres and identifiers are HMACed: 3 requests / 15 min per e-mail,
  10 / hour per IP and 10 verifications / 15 min per IP. Advisory locks make concurrent hits atomic.
- A successful code creates a random 256-bit bearer token and CSRF token; only hashes are stored.
  `__Secure-rowlens_sid` is HttpOnly/Secure/SameSite=Lax on production, expires after 30 sliding days
  and can be revoked on this or every other device. A second readable cookie supplies the double-submit
  token. Unsafe requests also require the exact Origin and `Sec-Fetch-Site: same-origin` when present.
- `app_user` is global; `membership`, `login_code` and `user_session` carry `club_id` and RLS. Global
  identity/session lookup and global rate limits are exposed only through pinned `SECURITY DEFINER`
  functions; `rowlens_app` cannot read `app_user` or `auth_event` directly.
- Nodemailer sends NL/EN HTML + text through Resend SMTP. Production refuses to start without complete
  SMTP settings; development logs codes. The local default member is `rowlens@localhost.test`.
- All club routes resolve the session to `{clubId, userId}` before `withTenant`; no session still looks
  exactly like an unknown route. Upload creation has a per-user hourly bucket.

## Database (ADR-0005, #31)

- Drizzle ORM 0.45 on `pg`. Schema in `apps/web/src/server/db/schema.ts`; `pnpm --filter @rowlens/web
  db:generate` writes a SQL migration to `src/server/db/migrations/` (reviewed like code; never `push`).
- Two roles. `rowlens_owner` (the Postgres image's superuser) owns the tables and runs migrations.
  `rowlens_app` is what the web app (and later the worker) connects as: login only, no BYPASSRLS, owns
  nothing, no CREATE; SELECT/INSERT/UPDATE/DELETE on tables via default privileges (a migration can
  REVOKE per table). The migrate command (`migrate.ts`) creates the role and (re)sets its password from
  `ROWLENS_APP_DB_PASSWORD` on every run, then applies migrations; the journal is in schema `drizzle`.
- `withTenant(db, {clubId, userId}, fn)` runs `fn` in a transaction with `app.club_id`/`app.user_id`
  set via `set_config(…, true)`, so they vanish at commit/rollback. Tenant tables use
  `tenantPolicy(…)`; outside `withTenant` the app sees no tenant rows at all.
- Prod: Compose service `migrate` (profile `migrate`, same image, `node dist/server/db/migrate-cli.js`)
  runs before `up` in `rowlens-deploy`. `web` gets `DATABASE_URL` for `rowlens_app`; `DATABASE_URL` is
  required in production. Migrations must be backward compatible with the previous release (expand,
  then contract), because a rollback keeps the migrated schema.
- E2E: Playwright's web server is `e2e/server.ts`, which starts a throwaway Postgres (Testcontainers),
  migrates it and then runs `dist/server/main.js`, so E2E needs Docker like the `db` tests. A fixed OTP
  exists only in `NODE_ENV=test`; startup rejects that setting in every other environment.
- Local: `docker compose -f infra/compose/docker-compose.dev.yml up -d`, copy `apps/web/.env.example` to
  `apps/web/.env`, `pnpm db:migrate`, then `dev:server` picks up the database.
- Source maps are built `hidden` (not referenced from public bundles).
- Dev: `pnpm --filter @rowlens/web dev:server` (Fastify, :3000) + `dev:client` (Vite, proxies
  `/api` and `/health` to Fastify).

Server state, pending manual steps and rollback: [docs/runbooks/server-setup.md](docs/runbooks/server-setup.md).

## Player (ADR-0007, #51)

`apps/web/src/client/player/`: `frames.ts` (pure frame arithmetic, unit-tested at 24–240 fps and
1 ms / 1/15360 / 1/90000 timestamp precision), `usePlayer.ts` (state, `requestVideoFrameCallback`
frame tracking with a `currentTime` fallback, stepping that chains while a seek is in flight, loop by
pause → seek → play, fullscreen with an iPhone CSS fallback, start/step measurements), `Player.tsx`
(controls, keyboard, hold-to-repeat buttons), `strings.ts` (NL/EN until #34).

- Demo page `/demo/player` exists only when `PLAYER_DEMO` (`src/client/features.ts`) is true: always in
  `vite` dev, in builds only with `VITE_FEATURE_PLAYER_DEMO=true` (CI's E2E build). CI checks that a
  production build contains no demo code; `dropUnreachableChunks` in `vite.config.ts` removes chunks that
  Rolldown emits for eliminated dynamic imports.
- Demo clips: `pnpm demo:media [clip …]` (ffmpeg in Docker, `scripts/demo-media/`) writes to the
  gitignored `apps/web/public/demo-media/`; `.dockerignore` keeps local clips out of images.
- **Stroke-moment jumps (2026-11-04)**: ⏪ / ⏩ in the controls go to the previous / next moment on
  the stroke strip (`strokeMarks`, so the computed drive middle too when it is shown), paused like
  a step and counted from `baseFrame()` (a seek's target while it is in flight) so quick taps go
  one moment further each. Off in a direction with no moment left; without any marks both are off
  and a hint says to mark a moment. Not shown where the page passes no `strokeMarks` (demo page).
  Layout: the jumps flank the steps in `.player__stepbar`; on a phone (container < 520 px) the bar
  is `display: contents` and the jumps sit beside the speed; one row from 1060 px (was 880) since
  the wider step bar no longer fits beside speed and loop at 985 px.
- **Zoom (2026-11-03)**: `zoom.ts` holds the pure view math (`View` = scale 1–6 and the picture point
  at the stage's centre; `zoomAt` keeps a picture point under the cursor or fingers, `panBy`,
  `clampView` keeps the picture filling the stage, `viewBoxOf`). `Player.tsx` transforms only the
  `<video>` (`translate(...) scale(s)` about the centre of the stage), so the stage, the corner
  buttons, the drawing confirm bar, note cards and every control below keep their place and size.
  Input: two pointers pinch (zoom about the starting midpoint plus the midpoint's movement), one
  pointer pans once zoomed (not while the page draws: `panLocked`), a pan swallows the video's
  play/pause click; ⌘/Ctrl + wheel and a Chromium trackpad pinch arrive as `wheel` with `ctrlKey`;
  Safari's `gesture*` events are prevented on the stage and zoom the picture only when no pointers are
  down (a Mac trackpad). `+`/`=`, `-`, `0` in the key handler. The stage is `touch-action: pan-y`
  (page scroll, no page zoom) and `none` while zoomed. The drawing layer reads the view from
  `ViewContext` and sets its viewBox to the part in view (same mapping as the video's transform),
  dividing its stroke unit by the scale so lines and handles keep their size on screen; pointer
  mapping already goes through `getScreenCTM`, so taps land in picture coordinates.
- **Production currently runs with the demo on** (Ewout, 2026-11-01, to try it on phones):
  `images.yml` builds with `VITE_FEATURE_PLAYER_DEMO=true`, and the Dockerfile's `demo-media` stage
  generates the synthetic clips inside the image (~70 MB). It's public (no login yet) and contains no
  user data. To turn it off, drop that build arg; the bundle check in CI proves the off state.

## Local edge stack (`infra/compose/docker-compose.edge.yml`)

`pnpm edge:up` builds rowlens-web and starts it behind Caddy at http://localhost:8080, using a copy of
trustable.nl's Caddyfile (`infra/caddy/edge.Caddyfile`) that imports our route (`infra/caddy/rowlens.caddy`,
the source of the #24 change). AudioScribe and the trustable.nl site are stand-ins that echo the path they
receive. `pnpm e2e:edge` runs the Playwright smoke + `e2e/edge.spec.ts` through it; `pnpm edge:down` stops
it. Networks mirror ADR-0002 (only rowlens-web is on the proxy network). No TLS locally.

## CI (`.github/workflows/ci.yml`)

policy (PR title + branch name) · web (format, lint, typecheck, test, build, Playwright smoke, audit) ·
edge (Playwright through the Caddy mirror) · worker (ruff,
mypy, pytest, pip-audit) · secrets (gitleaks) · images (build web + worker for linux/amd64, smoke test).
`release.yml`: release-please (changelog + semver tags). · deploy-script (shellcheck, stubbed unit tests,
real-Docker rehearsal of `rowlens-deploy`).

## Delivery (ADR-0002, #25)

```
merge to main ──▶ images.yml: rowlens-web + rowlens-worker → ghcr.io/…:sha-<7>   (no deploy)
Ewout: Actions → deploy → Run workflow (tag) ──▶ deploy.yml
   ssh (CI key, forced command) "deploy <tag>"  + GITHUB_TOKEN on stdin
      └▶ /opt/rowlens/bin/rowlens-deploy: pull → pg_dump → migrate (if defined) → up
         → wait until web runs <tag> and /health/ready answers → keep, or roll back to previous
         → prune RowLens images except current + previous
   then: public check https://trustable.nl/projects/rowlens/health/live reports <tag>
```

- Server files: `/opt/rowlens/{docker-compose.yml,.env,bin/rowlens-deploy,state/,backups/,.docker/}`.
- `infra/deploy/install.sh` (approval) installs the script + compose file and restricts the CI key.
- Manual: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy status|rollback`.
- Exit codes: 0 ok · 2 failed (nothing to roll back / nothing changed) · 3 rolled back · 4 rollback failed.

## Known constraints

- Same origin as trustable.nl and AudioScribe — see ADR-0003 risk; plan an own host before club #2.
- Shared CPU: transcoding is limited to 2 vCPU at low priority.
- trustable.nl's site-wide `Permissions-Policy` blocks the microphone and camera for RowLens (in-browser
  voice notes need the own host); Caddy's 64 MB body limit is only a backstop (ADR-0003).


## Upload acknowledgement ordering (2026-11-07)

Chunk processing returns a plain HTTP result from the tenant transaction. Only after COMMIT and
release of the per-upload busy slot does the route send its reply. A 204 therefore guarantees
committed progress and (for completion) the durable processing job, and permits an immediate next
chunk/termination. Parent authorization locks still cover the entire bounded stream; API status,
offset and error formats remain unchanged. A real deferred-commit regression enforces this order.
