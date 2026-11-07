# User directory and full account editor — proposal

Status: awaiting Ewout's approval of identity/authority changes and migration 0024.
Date: 2026-11-07. Continues PR #157; no merge/deploy approval.

## Requested outcome

Users is a compact table/list rather than expanded settings cards. Every displayed field can be
filtered and sorted. Editing opens one account form for names, email, roles and preferences.
Club administrators see only their club's members and pending requests; RowLens administrators
see all accounts, including accounts with zero memberships and all pending club requests.

## Directory and fields

- Default columns: first name, last name, email, RowLens role, clubs/club roles and membership/request
  status. Column selection adds default boat, language, display theme, note visibility, note hold
  duration, drive-middle preference, account creation/verification and permitted last-activity dates.
- Every available column has a filter and ascending/descending sort; a separate sort selector also
  works on narrow screens and hidden columns. Text uses case-insensitive matching, enumerations
  use explicit choices, booleans include unknown and dates support a range. Unknown preferences
  remain distinct from saved defaults. Clubs/roles/status support exact membership filters.
- Query/page boundaries use Zod and a server allowlist of sort/filter fields. Stable UUID tie-breaks
  prevent duplicate/missing rows across pages. Apply actor/tenant scope before filtering/counting,
  ordering and pagination, so even counts and choices cannot expose another club's users.
- Phone layout keeps scrolling inside the results area or uses a labeled list with the same
  filters/sort controls. Names and Edit actions remain usable; controls/labels >=44 px. Verify
  iPhone WebKit and Chromium 1000x540, including long values and empty results.

## Account editor

| Attribute | RowLens administrator | Club administrator |
| --- | --- | --- |
| First/last name, default boat and account preferences | Edit any account | Edit own-club members |
| Email/login identity | Initiate verified change | Initiate verified change for own-club members |
| Club memberships and additive rower/coach/club-admin roles | Manage any club, explicitly one club at a time | Manage only selected club |
| Global RowLens administrator role | Grant/revoke with inline confirmation and audit | Read-only; cannot grant/revoke |
| ID, creation/verification/activity dates | Inspect | Inspect only permitted account/own-club metadata |

Account profile/preferences remain global across clubs; the form states this. Club roles are
separate from global authority and always name their club. Club admins cannot view/edit other-club
memberships or use a matching name/email to select another account. Preserve current revision
conflicts, stale-response guards, immutable server grants, self/last-admin protections and audit.
The global role must appear explicitly in the directory/form, including when the account also has
a club-admin role. Do not infer it from name, email or local allowlists.

Membership/role actions remain tenant-context operations, each with its own result. The editor
must not report a profile save as a successful role save or hide a failed membership action.
Account IDs and system timestamps remain read-only; they are not editable business attributes.

## Identity changes and migration 0024

The current schema intentionally does not permit editing email or global authority through the
settings form. Implement these as explicit protected operations, not expanded arbitrary SQL access.
No new dependency is needed.

1. Add protected global `account_email_change` pending state (like account OTP/session storage,
   not tenant content), plus narrow, pinned SECURITY DEFINER functions. The app role cannot read
   or mutate this storage directly. Record actual actor/target UUIDs in the existing audit.
2. A requested email change leaves the verified login unchanged until the new mailbox proves
   ownership using an expiring, attempt-limited code (10 minutes, consistent with login OTP).
   Normalize/validate email, reject duplicates, bind the proof to target ID/revision and rate-limit.
   Provide NL/EN messages and mail templates, using the existing mail provider/test seam.
3. Confirmation rechecks actor/target authorization and revision; preserve target ID, history and
   memberships. Synchronize email-keyed club access without changing roles, under the existing
   ordered admission locks. Revoke old sessions/codes when the identity change commits. Never
   merge accounts or inherit an unrelated grant at the new address. No real mail is sent in tests.
4. Server-configured identities cannot be renamed by the form: the old address would remain in
   AUTH_ADMIN_EMAILS/AUTH_ALLOWED_EMAILS. Explain this in the form. Any environment change remains
   a separate operator-approved task, never an automatic part of account editing.
5. Add a protected platform-only authority operation, serialized across global grants, with
   persisted permission rechecks, inline confirmation, self-demotion protection and a last-global-
   admin guard. Club admins cannot call it through a forged role/club/user payload. Existing
   operator bootstrap remains available for first-admin/recovery.
6. Expose a scoped, typed directory/detail projection with role/preference fields and pending
   requests. Keep account-only and tenant content access separate. Use the new migration for
   function changes; do not rewrite locally applied migrations 0020-0023.

## Verification and rollout

- Database/API tests: every field filter/sort, stable paging, exact actor scope/counts, zero/one/
  multiple clubs, pending requests, global role display/assignment/revocation/last-admin races,
  email duplicate/expiry/wrong-code/replay/concurrent revision, session revocation, grant sync,
  server-managed identities, forged actor/target payloads and archived-club boundaries.
- Browser tests: compact listing, per-field filters/sort in NL/EN, full editor, preference/name/role
  changes, pending email confirmation and failures preserving drafts, club-admin isolation and
  platform access without a selected club; phone WebKit and low laptop window.
- Run repository checks and local migration/rollback rehearsal. Update documentation and the PR
  security note. Local stack is the review target; production, real account mutation and real
  notification delivery remain untouched during implementation.
