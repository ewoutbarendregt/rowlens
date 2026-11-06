# Admin inspection and editing of user settings (#151)

Status: proposed; architectural approval required before application or migration changes.
Request: "Als beheerder wil ik alle settings van alle gebruikers kunnen inzien en aanpassen".
Issue: https://github.com/ewoutbarendregt/rowlens/issues/151

## Current inventory

| Setting | Current source | Current editing |
|---|---|---|
| First name, last name, default boat | `app_user`, migration 0016 | Own account menu, `PUT /api/me/profile` |
| Role and access | `membership`, `club_access`, server allowlists | Existing Admin access routes, with self/last-admin/server-managed protections |
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

## Proposed behaviour

- Admin → Users lists all current-club accounts, searchable by name/e-mail. Each user has an
  in-page Settings form for profile, display and video preferences. Existing role/access actions
  remain available in the same user area with their existing guards.
- A user who has access but has never signed in remains visible in the access list. Until an
  account/membership exists, show that status; do not invent a profile or browser preferences.
- Admins can inspect and edit another member without applying that member's theme/language to
  their own interface. Explicit Save/Cancel, validation and network/conflict feedback preserve drafts.
- Members retain their own settings controls. This is editing preferences, not introducing locked
  organizational policy. Saved choices follow the member across devices within the current club.
- Anonymous login-page language/theme remain device choices. Once signed in, centralized settings
  become authoritative. OTP mail continues to follow the explicit login-page language (ADR-0015).
- Remote changes apply on the member's next settings refresh/reload/focus synchronization, without
  remounting the app or interrupting drawings/uploads. There is no impersonation or forced login.

## Proposed persistence and authorization

One migration, no new dependency:

1. `user_settings`: unique `(club_id, user_id)`, linked to the current-club membership; five typed
   preference columns (language, theme, notes_visible, note_hold_seconds, drive_middle), revision
   and timestamps. Enum/range checks match the existing supported choices. Initially nullable
   fields mean unimported, not a known preference. Use application defaults for effective behaviour.
2. `user_settings_audit`: append-only club-scoped records of actor, subject, time and changed keys
   for administrative profile/preference changes. Existing role/access logging remains in use.
3. Protected SQL functions for admin profile reads/writes, because the app role cannot directly
   read/write `app_user`. Check `app.role = admin` and target membership in `app.club_id`, pin
   `search_path`, restrict grants and use `withTenant` repositories; no raw global table access.

Preferences, audit and role/access are club-scoped. RLS must restrict preference reads/writes to
self or current-club admin; audit reads are admin-only and existing audit records cannot be edited
or deleted by the app. Test DB policies directly as well as the API guards.

Names/default boat retain their existing global account meaning (ADR-0005): a profile edit affects
that account wherever used. Admin profile operations may target only an existing member of their
own club; they expose no other club's settings, membership or activity. Explicitly test a global
account shared by clubs and unrelated users, rather than treating profile fields as club-local.

Proposed routes:

- `GET/PATCH /api/me/settings`: signed-in member's own five preferences.
- `GET /api/admin/users`: current-club member summaries and account status, not unrestricted users.
- `GET/PATCH /api/admin/users/:id/settings`: admin profile/preference inspection and update.
- Keep the existing profile and role/access routes compatible and share validation/storage logic.

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
  field changes, not the whole stale local snapshot. Key authenticated caches by account + club.
- On sign-out/account/club change, cancel pending requests and isolate cached state. Settings from
  one user or club must not be imported into another account.
- Admin UI distinguishes unsynchronized browser values from stored choices. An admin can set an
  explicit value before that member next visits, and that value must survive the first import.

## Implementation and validation after approval

1. Record an accepted ADR updating the per-device decisions in ADR-0014/0015; implement migration,
   typed schemas, tenant repositories, protected profile functions and audit together.
2. Add API/DB tests first: non-admin/anonymous/pilot refusals, other-club enumeration/write refusal,
   invalid values, stale revisions, audit atomicity/immutability and membership eligibility.
3. Add the self-settings sync and update current profile/display/video controls; retain safe login
   defaults and current working upload/player/drawing state.
4. Extend Admin user UI in NL/EN, with 44 px controls and explicit Save/Cancel/error handling.
5. Test confirmed legacy import vs admin edits, two devices, account/club switching, unavailable storage and
   backwards-compatible profile updates. Test a user who has never synchronized preferences.
6. Run format/lint/typecheck/pnpm test, worker checks and local/edge E2E, plus iPhone WebKit and
   1000×540. Include upgrade tests from the existing schema and a Security review note in the PR.
7. Review on the local stack; merge and production deployment each need a new explicit instruction.

## Approval requested

Approve centralized storage of the five currently device-local preferences, the two new scoped
tables/audit and the protected administrative profile operations described above. No application,
schema, dependency or production change is authorized or implemented by this proposal alone.
