# Admin inspection and editing of user settings (#151)

Status: accepted by Ewout on 2026-11-06 ("Ok voer maar uit"); implemented on codex/feat/151-admin-user-settings. See ADR-0019.
Request: "Als beheerder wil ik alle settings van alle gebruikers kunnen inzien en aanpassen".
Issue: https://github.com/ewoutbarendregt/rowlens/issues/151

## Product model clarified by Ewout

"Er is maar 1 register van gebruikers. Een gebruiker kan verschillende rollen hebben: roeier,
coach, beheerder".

There is one central `app_user` identity, one profile and one set of personal preferences per user.
A person may simultaneously have any non-empty combination of rower, coach and admin. Role grants
are permissions on that same identity, not separate user records or separate settings per role.
The existing central register is retained. Club membership still scopes access to tenant data;
this clarification does not authorize removing RLS or granting platform-wide cross-club access.

The current implementation has one scalar role on membership/access, in auth responses and in
API/client/RLS checks. Multiple roles therefore require an authorization/data migration, not just
replacing a dropdown with checkboxes.

## Inventory at approval

| Setting | Current source | Current editing |
|---|---|---|
| First name, last name, default boat | `app_user`, migration 0016 | Own account menu, `PUT /api/me/profile` |
| Roles and access | Currently one scalar role on `membership` / `club_access`, plus server allowlists | Proposed multi-role checkboxes on the same user, retaining self/last-admin/server-managed protections |
| Interface language | Browser `rowlens.lang` | Language switch; NL/EN |
| Colour mode | Browser `rowlens.theme` | Light/dark/high contrast |
| Notes visible on video | Browser `rowlens.videoNotes.visible` | Video toolbar; default on |
| Note display duration | Browser `rowlens.videoNotes.holdSeconds` | 0.5/1/2 seconds; default 1 |
| Calculated middle of drive | Browser `rowlens.driveMiddle` | Strokes panel; default off |

`app_user.locale` also exists but currently follows the language of an OTP request; it is not
proof of the member's current interface language. Browser-only values cannot be read remotely
until that browser returns and synchronizes. Do not display inferred defaults as observed values.

The e-mail address is the login identity and is shown for identification. Changing/transferring
that identity is not part of the generic settings update. Notification preferences (#63) and
other unimplemented features are not existing settings and are outside this change.

## Accepted behaviour

- Admin → Users lists all current-club accounts, searchable by name/e-mail. Each user has an
  in-page Settings form for profile, display and video preferences, plus three independent role
  checkboxes: Rower, Coach, Admin. A rower+coach is one user with both boxes selected. Access
  removal stays an explicit separate action; do not accidentally revoke access by clearing all roles.
- A user who has access but has never signed in remains visible in the access list. Until an
  account/membership exists, show that status; do not invent a profile or browser preferences.
- Admins can inspect and edit another member without applying that member's theme/language to
  their own interface. Explicit Save/Cancel, validation and network/conflict feedback preserve drafts.
- Members retain their own settings controls. This is editing preferences, not introducing locked
  organizational policy. Saved choices follow the same user across devices and roles.
- Anonymous login-page language/theme remain device choices. Once signed in, centralized settings
  become authoritative. OTP mail continues to follow the explicit login-page language (ADR-0015).
- Remote changes apply on the member's next settings refresh/reload/focus synchronization, without
  remounting the app or interrupting drawings/uploads. There is no impersonation or forced login.

## Rower navigation and roster boundary (Ewout, 2026-11-06)

"Gebruikers met rol roeier zien alleen trainingen en hun eigen settings, tab ‘roeiers’ is dan niet
zichtbaar".

| Assigned roles | Navigation / settings | Standalone Rowers directory |
|---|---|---|
| Rower only | Trainings and own account settings | Hidden; direct route and general roster-management requests denied |
| Coach (including Rower + Coach) | Trainings, Rowers and own account settings | Available with coach rights |
| Admin (with any other assigned roles) | Trainings, Rowers, Admin and own account settings | Available with admin rights |

This follows the previously specified additive role model: a rower+coach retains coach rights;
having the rower box selected does not remove a separately granted capability. Preferences remain
on the same central user account regardless of role combination.

Hiding the link is insufficient. Guard `/rowers` on the client and the general roster directory
and management APIs on the server; apply corresponding tenant/role DB restrictions. Rower-only
accounts must not retrieve the full club directory, e-mail addresses or write/merge/archive roster
entries through direct requests. Never permit another user's settings updates from that role.

Keep existing permitted interactions inside visible trainings (their normal visibility/ownership
rules still apply). Any crew-name lookup needed by a training must be scoped to that visible
training and return only necessary fields, rather than reusing an unrestricted roster endpoint.

Current implementation is broader: AppHeader always renders Rowers, the client route requires only
login, roster routes use the auth guard and `can(manage_roster)` permits all roles. This request
supersedes the roster-management part of the old ADR-0013 decision when implemented; record the
accepted change there along with the role-set migration.

## Accepted persistence and authorization

One migration, no new dependency and no second user register:

1. Extend the existing global `app_user` account with the five typed preference fields (language,
   theme, notes_visible, note_hold_seconds, drive_middle), a settings revision and timestamps.
   Enum/range checks match existing choices. Initially nullable preference fields mean unimported,
   not a known preference. Apply existing defaults for effective behaviour without pretending those
   defaults have been observed. Keep all personal settings on the same account, not per role/club.
2. Replace scalar membership/access roles with validated role sets on the existing records.
   Proposed representation: non-empty, duplicate-free `roles` arrays containing only rower, coach
   and admin. Existing scalar values migrate to singleton sets, preserving current access.
   Pending access/invitation grants and active memberships stay synchronized atomically; login
   must not replace a deliberately assigned combination with a single default role.
3. Add one tenant-scoped, append-only `user_settings_audit` table for actor, subject, time and
   changed keys/role sets. Retain existing role/access audit history; new multi-role writes must
   be recorded without fabricating one scalar role as the full set.
4. Protected SQL functions for account settings/profile reads and writes: the app role still
   cannot access global `app_user` directly. Through `withTenant`, check explicit admin membership
   and target membership in `app.club_id`, pin `search_path`, restrict grants and validate input.

Authorization combines the granted roles for the requested action and current resource; never
choose one role and discard the others. Replace scalar role equality checks in authentication,
`TenantContext`, `can()`, route guards, client navigation/tools and DB visibility helpers. An
admin capability may allow more than a rower capability, but that does not silently assign the
rower or coach role to an admin. Preserve existing session/note visibility and author restrictions.

Club memberships, access and audit remain tenant-scoped; RLS continues to isolate club data.
Global personal settings retain the account semantics of `app_user`: a change applies wherever
that account is used. Administrative operations may target only a member of the authorized club;
they do not enumerate another club's users or expose its role assignments/activity. Test shared
accounts and unrelated users explicitly. A central identity register is not a new platform-admin
permission model.

The last-admin guard checks whether the admin role would disappear from the final eligible
administrator, including concurrent updates. Server-managed admin grants are preserved additively
without erasing other assigned roles. Authenticated empty/unknown role sets must deny access;
never reinterpret them as the worker/pilot's existing special service context.

Implemented routes:

- `GET/PATCH /api/me/settings`: signed-in member's own five preferences.
- `GET /api/admin/users`: current-club member summaries and account status, not unrestricted users.
- `GET/PATCH /api/admin/users/:id/settings`: admin profile/preference inspection and update.
- Keep the existing own-profile flow working; expose the complete `roles` set consistently to
  authenticated clients and admin access APIs. Coordinate the role payload transition rather than
  accepting a legacy scalar update that silently removes other roles.

An administrative profile/preferences update and its audit entry commit in the same transaction.
Validate partial payloads and use a revision/snapshot precondition to reject stale edits (409)
instead of silently overwriting newer settings. Server-managed access and last-admin protections
remain effective; a generic settings body cannot change them.

## Preserve existing device choices

- If a server field is uninitialized, the member may import its current validated browser choice
  once after authentication. Legacy global browser keys have no account owner: ask the signed-in
  member once before assigning those choices to their account. Do not silently treat anonymous or
  another account's cached choices as their preferences. Missing/unavailable storage uses defaults.
- Fill only still-uninitialized server fields atomically. Never overwrite an admin's saved value
  or a concurrent explicit member edit with late bootstrap data.
- Existing server values win over old browser caches on later visits. Persist only deliberate
  field changes, not the whole stale local snapshot. Key personal-preference caches by account; retain club-scoped authorization state separately.
- On sign-out/account change, cancel pending requests and isolate personal cached state. On club
  changes, refresh authorization; the same user keeps the same preferences. Never import one
  user's cached preferences into another account.
- Admin UI distinguishes unsynchronized browser values from stored choices. An admin can set an
  explicit value before that member next visits, and that value must survive the first import.

## Implementation and validation after approval

1. Record an accepted ADR updating the per-device decisions in ADR-0014/0015; implement migration,
   typed schemas, protected global-account functions, role sets, tenant policies and audit together.
2. Add API/DB tests first: non-admin/anonymous/pilot refusals, other-club enumeration/write refusal,
   invalid values, stale revisions, audit atomicity/immutability and membership eligibility. Cover
   all seven non-empty role combinations, role removal without losing other roles, singleton
   backfill, last-admin concurrency and rejection of empty/unknown/duplicate roles. Rower-only
   tests cover absent Rowers/Admin navigation, direct-route/API refusals, DB write refusals, own
   settings access and scoped training crew lookups; combined-role tests preserve coach/admin access.
3. Add the self-settings sync and update current profile/display/video controls; retain safe login
   defaults and current working upload/player/drawing state.
4. Extend Admin user UI in NL/EN, with 44 px controls and explicit Save/Cancel/error handling.
5. Test confirmed legacy import vs admin edits, two devices, account/club switching, unavailable storage and
   backwards-compatible profile updates. Test a user who has never synchronized preferences.
6. Run format/lint/typecheck/pnpm test, worker checks and local/edge E2E, plus iPhone WebKit and
   1000×540. Include upgrade tests from the existing schema and a Security review note in the PR.
7. Review on the local stack; merge and production deployment each need a new explicit instruction.

## Approval requested

Approve extending the existing central account with personal preferences, migrating scalar roles
to role sets, one new scoped audit table and the protected administrative operations above. No application,
schema, dependency or production change is authorized or implemented by this proposal alone.
