# ADR-0019: Central account preferences, additive role sets and admin editing

- **Status**: accepted
- **Date**: 2026-11-06
- **Deciders**: Ewout (product owner); implementation by Codex

## Context

Ewout asks to inspect/edit all users' settings, with one register and multiple simultaneous roles.
Five preferences previously lived only in each browser, whereas names/default boat were global
account fields and club permissions used one scalar role. A rower-only user must see Trainings and
own settings, with no standalone Rowers directory. The architectural plan in
`docs/plans/151-admin-user-settings.md` was approved with "Ok voer maar uit".

## Decision

Keep one `app_user` identity/profile/preferences set; membership and access stay tenant scoped.
Migration 0018 extends that account with the five typed nullable preferences and a revision/time,
backfills scalar membership/access roles into validated non-empty unique arrays, and adds one
scoped append-only settings audit. No dependency or second user register. Login e-mail is shown for
identification; changing identity is out of scope. Never-signed-in grants have no invented settings.

Capabilities combine all assigned roles, including current sessions and subsequent OTP logins.
Role changes serialize per club, recheck the actor after acquiring the lock, preserve server admins,
prevent self-demotion/removal and the last admin's removal. Provisioning re-reads grants under the
same lock. The worker is explicitly a service; authenticated empty roles never gain service rights.

Admin settings reads/writes use `withTenant` and pinned definer functions. Require the target to be
a current-club member and check actual actor admin membership. Settings remain global to that
account across clubs; membership/roles/activity of other clubs are neither listed nor changed.
Partial writes lock the account and check its revision; save and audit commit together. Existing
own-profile controls remain available. The new UI sends revisions and preserves dirty drafts on
remote refresh; legacy explicit own-profile requests remain compatible. No direct global table
access is granted to the app role. Audit reads are admin-only; UPDATE/DELETE are revoked.

Rower-only navigation and direct routes/general roster APIs are protected; restrictive roster
policies deny writes and limit reads. Training lookups return only necessary crew fields and omit
e-mails. Existing visible-training/note/lineup/sharing rights remain. This supersedes the earlier
roster-management permission in ADR-0013, not the existing training visibility rules.

Central settings become authoritative after sign-in. Null means uninitialized, not an observed
default. Anonymous language/theme stay device choices. Explicit one-time import fills only still-null
preference keys atomically, so delayed device data cannot overwrite an admin's saved values.
Caches are keyed by account ID and contain only preferences/revision, not profile names/e-mail.
Requests are owned by an account generation; late responses cannot affect another account. Explicit
preference patches serialize with confirmed revisions; conflicts reload and report failure instead
of silently retrying over remote changes. Refresh on login/reload/window focus applies remote
changes without remounting the player or interrupting drawings/uploads. Admin editing another
person never applies that person's display preferences to the admin interface.

## Consequences

- Schema/auth/API/client/worker ship together; do not roll an old scalar-role web image over the new
  schema. Use the normal backup/deploy workflow, with explicit deployment authorization each time.
- Unknown browser choices cannot be inspected remotely until the owner confirms import or saves
  them; the admin sees their uninitialized status and can choose values directly.
- Role sets add seven supported combinations; cross-club isolation, concurrent access changes,
  legacy backfill/live sessions, conflicts, account switching and phone layouts are covered by tests.
- This is club-admin management, not platform-wide cross-tenant administration or impersonation.

## Alternatives considered

- Keep browser-only preferences: an admin cannot inspect or edit what the server does not know.
- Separate users/settings by role: duplicates identities and makes additive permissions ambiguous.
- Auto-import anonymous device keys or blindly retry stale saves: may transfer another person's
  device choices or overwrite a newer admin decision.
- Add a second settings identity/table or real-time push dependency: unnecessary for five fields
  and focus/reload synchronization. Existing account and Postgres locks/revisions suffice.

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
