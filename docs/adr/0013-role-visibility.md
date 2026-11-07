# ADR-0013: What a rower sees, enforced by the database

- **Status**: accepted
- **Date**: 2026-11-02

## Context

Since #120 a member is a rower, coach or admin, but everyone signed in saw everything. Ewout decided
(2026-11-02):

- a **rower sees only the sessions they rowed in** (they are in its lineup) or created;
- **notes are private by default**: coaches and admins see all; a rower sees a note when it is
  assigned to them, shared with them (one by one or with the session's crew), or written by them;
- otherwise rowers may do everything: write and draw (changing only their own), share, upload, keep
  the roster and lineups. Only Admin stays admin-only.

ADR-0005 put tenancy in Postgres RLS so a forgotten filter can't leak another club's data. The same
argument holds within a club.

## Decision

- `withTenant` also sets **`app.role`** (`rower | coach | admin`). An empty role (the worker, the
  pilot-code path) sees the whole club, as before.
- **Restrictive RLS policies** (they must pass *in addition to* the club policy) on `rowing_session`,
  `video`, `lineup_seat`, `annotation`, `moment`, `moment_rower`, `moment_rower_log` and
  `moment_share`. They call small `SECURITY DEFINER` SQL functions with a pinned `search_path`:
  `rowlens_sees_all()`, `rowlens_my_rowers()`, `rowlens_can_see_session()`, `rowlens_can_see_video()`,
  `rowlens_can_see_moment()`, `rowlens_can_see_moment_id()`. Definer functions read past RLS, so the
  policies don't recurse. A test checks that exactly these tables carry a restrictive policy.
- A rower may change or delete only annotations they wrote (`annotation.author_user_id`). Older
  annotations have no author and stay coach-only.
- A session is also visible to a rower when a note in it is assigned or shared to them one by one,
  otherwise they couldn't open that note. They still see only the notes meant for them.
- **Linking an account to the roster** is required for any of this: on login, the roster entry a
  coach gave exactly that e-mail address (and that has no account yet) is linked. Name-only matching
  stays for #110.
- The API's own decisions (who may take back a share, who may edit an annotation, who may manage
  access) live in one pure module, `server/auth/can.ts`, tested for every role × action × relation.

## Consequences

- New tables that hang off a session or a note need a restrictive policy too; the test lists them.
- The visibility functions run per row; fine for a club's volume, worth an index check if a club grows
  large.
- A rower who removes themselves from a lineup they didn't create loses sight of that session.

## Addendum 2026-11-02: coaches see their own sessions too (#108)

Ewout: "the admin sees all sessions, other users only their own." `rowlens_sees_all()` is now true
only for the admin (and for no role: the worker, the pilot path). A coach sees a session on the same
terms as a rower (created it, in its lineup, a note for them) and, within it, every note, which they
may change (`rowlens_coaches_video()`). Existing sessions have no maker: only the admin sees them
until the admin gives them to a coach (`PATCH /api/sessions/:id/creator`, admin only).

## Addendum 2026-11-06: additive role sets and the roster boundary (#151)

ADR-0019 replaces the scalar role with non-empty validated role arrays. Capabilities add up;
rower+coach retains coach rights. `app.roles` drives restrictive policies; an explicit service flag
replaces the old implicit empty-role worker exception. An authenticated empty role set is denied.

Ewout: "Gebruikers met rol roeier zien alleen trainingen en hun eigen settings, tab ‘roeiers’ is dan
niet zichtbaar". This supersedes rower roster management above. Rower-only users cannot open the
standalone directory or create/edit/archive/merge roster entries. Client navigation and routes,
API guards and restrictive roster policies enforce it. Needed crew names are scoped to an accessible
training and omit e-mails; existing lineup, note assignment and sharing rights remain.

## Addendum 2026-11-06: club-wide training reading and staff editing (#154)

ADR-0020 supersedes the earlier own/reachable-only training scope: every club member reads all club
trainings; rower-only users edit self-created trainings, while coaches/admins edit all. Foreign
trainings are fully read-only for rowers, including old own feedback, sharing and assignment.
Private feedback visibility, club isolation, additive roles, standalone roster restrictions and
admin-only account/creator administration remain. Migration 0019 separates resource read/write
policies and media operations authorize before file effects.


## Addendum 2026-11-07: unified accounts and platform administration

ADR-0021 supersedes one-club signup/identity constraints in the feature-enabled flow: accounts may
apply to several clubs, with admission controlled by club administrators. Rower/coach/club-admin
permissions remain club scoped; a separately persisted RowLens-admin grant has full selected-club
content access, including private feedback. New auth does not silently elevate existing server
admins. Historical roster IDs are compatibility references during explicit account mapping; the
standalone Rowers register/UI is retired in this flow. The paired feature flags are off by default
in production builds; this addendum does not authorize deployment.
