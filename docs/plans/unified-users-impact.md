# Unified users and retirement of the Rowers section — impact analysis

Date: 2026-11-07. Status: implementation approved by Ewout ("ja uitvoeren", 2026-11-07); local work in progress.
Request: “laat de hele sectie roeiers vervallen. er zijn alleen gebruikers met rollen (roeier, coach, clubbeheerder, rowlens admin). analyseer de impact hiervan voordat je begint”

## Findings from the current code

- `shared/roles.ts` defines three additive club roles: `rower`, `coach`, `admin` (seven non-empty combinations). There is no distinct platform-admin role. `AUTH_ADMIN_EMAILS` guarantees the existing club-admin role in the configured pilot club; it is not a cross-club administration model.
- Identity/profile/preferences already live in global `app_user`; club membership/roles in `membership`. `club_access` authorizes invitations before first login; provisioning currently creates the account/membership and links an existing roster entry by exact email.
- The separate tenant-scoped `rower` register allows people without accounts or email, separate display names, archival and merging. Removing the page alone would leave that second identity register in place.
- Five tables store roster identifiers: `lineup_seat`, `moment_rower`, `moment_share`, `moment_rower_log`, `angle_measure`. Four have foreign-key references; the historical log also stores identifiers. Keys/uniqueness preserve club boundaries, unique seats, assignment/share recipients and per-person measurements.
- `api/rowers.ts` exposes directory CRUD/merge and training-scoped choices. `RowerPicker` supports inline creation from lineups/feedback. Lineup, note assignment/sharing, angle APIs and their UI all depend on roster IDs. Session/video responses embed these identities too.
- Private note visibility uses the current account-to-roster mapping (`rowlens_my_rowers` and related SQL helpers). Crew shares depend on lineup membership. Account author display and auth status also consult the roster. These dependencies must change together to prevent missing feedback or unintended disclosure.
- Current policy (ADR-0020): every club member reads all club trainings; rower-only users edit their own, coaches/admins edit all; private feedback remains restricted. This requirement does not by itself change that policy.

## Confirmed product decisions (2026-11-07)

Ewout confirmed: first an account, public account requests, membership of multiple clubs, RowLens
administration of clubs, club-admin admission of new users, first club **WVIJburg**, later club logos
and interface design, and RowLens-admin access to everything, including all club content.
These decisions supersede the open alternatives in the original analysis. See proposed ADR-0021.

## Proposed product and permission model

One person has one account/profile/preferences set and club-scoped membership; several roles can combine. Retire the entire Rowers page, menu, standalone CRUD/archive/merge and inline name-only creation. Club administration uses the existing Users area, extended with membership applications. Platform administration manages clubs and platform-wide users. Applicants first establish an email-verified account; account creation alone grants no club access. Old `/rowers` URLs receive a defined safe destination; they must not expose a directory to unauthorized users.

| Role | Proposed authority |
| --- | --- |
| Rower | Read club trainings; edit own trainings with current rower capabilities; own settings. |
| Coach | Edit all club trainings, coach feedback, stroke marks and angle measurements; no account/role administration. |
| Club administrator | Existing `admin` club authority: manage club users/access/settings and training ownership. Cannot grant platform privileges. |
| RowLens administrator | Global authority: manage clubs and users, and read/change all club content, including private feedback. Server-validated platform authority, explicit club context and administrative audit protect this access; club admins cannot grant this role. |

Keep `admin` as the internal club-role identifier initially, with explicit NL/EN “club administrator” wording. Do not simply append a global role to the club role array: club admins must never be able to grant it. Platform administration must still select a club and use tenant-scoped repositories. Full access is explicit authorization, not an unscoped database connection or impersonation; retain the actual administrator as the audit actor. A RowLens admin need not be an ordinary member of every club.

Proposal: only active club users with the rower role are selectable for new crew seats and per-rower measurements/assignments. Coaches who also row receive both roles. Existing historical selections survive role removal/access revocation. Recommend direct feedback sharing to all active club users, while retaining rower-role eligibility for new seats/measurements/assignments. These eligibility details are implementation defaults proposed for approval, not additional user decisions already confirmed.

## Migration and lifecycle impact

This needs schema/auth/API/UI work and a new ADR, not only menu removal. No new dependency is apparent. Exact migration count and global-role storage design are not yet fixed.

1. Inventory local and production data through approved read-only queries returning aggregate counts only: linked/unlinked/archived roster entries, duplicate links, pending invitations, name/email conflicts and references in all five tables. Read-only production preflight found 7 roster identities, all unlinked; 10 seats, 1 assignment, 0 shares, 1 historical event and 8 angle measures. No personal data was retrieved.
2. Map existing linked entries to their accounts. Match remaining entries only with verified deterministic identity evidence; never auto-merge by similar name, invent an email, send invitations or grant login access to preserve history. Report ambiguous/missing mappings before migration.
3. First an account (confirmed): resolve unlinked historical people to real verified accounts and club memberships before switching their historical references. No name-only/non-login substitute accounts. Unresolved mappings block final roster retirement; retain legacy history through the migration boundary until resolved. Do not discard records or auto-admit a person to preserve history.
4. Add club-safe user references, backfill through the mapping, check duplicate seat/assignment/share/angle keys and migrate historical logs without losing provenance. Account ID alone does not prove club membership. Role/access removal must retain historical names/references while removing new-selection and login permissions; current membership deletion must not cascade away sporting history. Define account erasure separately.
5. Switch API/UI/auth/SQL helpers together, including author names, current-user detection, private note recipients and crew sharing. Account names become authoritative; explicitly review legacy roster/account name conflicts.
6. Use expand/backfill/switch/contract with proven old-image compatibility and rollback behavior. Do not drop the roster or old columns in the first deployment. Final removal needs an approved contract migration after every history mapping is resolved and old clients/images are accounted for.

Pending invitations currently have no account ID. Under the confirmed account-first rule, an
invitation alone does not make someone selectable. Recommend selection only after account/email
verification and club admission. No fabricated identities or accounts created solely for history.

## Additional impact: applications, multiple clubs and full platform access

- Existing auth is coupled to `PILOT_CLUB_SLUG`; login identity and `user_session` carry one club.
  Supporting multiple memberships requires separating global account authentication from per-request
  club authorization. Existing OTP/session security stays; do not automatically turn a prior allowlist
  entry into platform authority. Account-only sessions must be able to see their own application status.
- Proposed flow: request account → verify email by OTP → complete profile → request membership of
  WVIJburg (or another available club) → club administrator approves/rejects → approved member selects
  the club. An existing account can apply to another club without creating another profile. Recommend
  initial admission as rower; coach/club-admin grants remain explicit administrator actions.
- Add a tenant-scoped membership-application lifecycle (pending/approved/rejected/cancelled), duplicate
  protection and audited atomic approval plus membership creation. Verify email before exposing
  applications to a club admin. Scope rate limits and generic responses to avoid account enumeration
  and application spam. Retention/reapplication policy must be specified during detailed design.
- A club switcher and club-scoped URLs/context must resolve live membership/roles on every request;
  an account may be coach in A and rower in B. Carry explicit club identity with each request so
  concurrent tabs cannot silently redirect writes into another club. Clear/isolate club data caches,
  drafts, outstanding responses, uploads and player state on a switch; keep account preferences global.
  Membership revocation affects that club only; global session revocation remains account-wide.
- Store platform authority separately from membership roles, with server-side verification and an
  audited operator bootstrap. RowLens admin manages club creation/settings and initial club-admin
  appointment, and can use every content operation including private feedback in any selected club.
  Tenant RLS still restricts every content operation to that selected club. Platform-level club
  listing/administration uses narrowly scoped protected functions/repositories. Never trust a role or
  elevated mode supplied by the browser; test direct SQL privilege forgery as well as API escalation.
- First club display name is exactly **WVIJburg**. Inventory the existing pilot club before mapping;
  keep its UUID and history rather than creating a second club. A slug/display-name adjustment must
  preserve existing links or provide redirects. The seeded pilot mapping retains its UUID/slug and updates the default Pilot display name to WVIJburg.
- Full platform content access changes the privacy/access description: update relevant privacy docs,
  permission matrices and ADR-0013/0019/0020 when implemented. Audit the real administrator and chosen
  club; full access does not authorize irreversible operations outside the normal approval rules.

## Later: club logos and interface design

Prepare club metadata and a club-context-aware design boundary; build the branding editor later.
Recommend club-admin configuration with RowLens-admin override, pending detailed branding design.
Use validated logo assets and versioned theme tokens/presets with Classical as fallback. Do not accept
arbitrary scripts/CSS/remote font imports. Preserve light/dark/high-contrast user preferences,
contrast, 44 px touch controls and locale; branding changes on club switch without leaking into other
clubs. Asset validation, storage limits, permissions and preview/rollback belong to that later change.
No branding upload, editor or new asset dependency is proposed for this first implementation.

## Proposed delivery slices

1. Define schema/auth transition and migration preflight; add verified account requests, independent
   account sessions and pending club applications, with preserved existing login behavior.
2. Add audited global RowLens authority, club management and WVIJburg mapping; club-admin admission,
   multi-club context/switching and isolation, including platform access to every selected-club operation.
3. Migrate resolved historical roster references to users, switch all selectors/feedback/measurements,
   retire the Rowers section and inline creation. Final database cleanup follows compatibility checks
   and resolution of all history mappings, not the initial rollout.
4. Later, separate change: club branding settings, logo uploads and design selection.

Keep intermediate feature slices behind appropriate flags until the complete flow works. No new
dependency is currently required; concrete migration/table/function details and rollback proof must
be reviewed before implementation. A dedicated implementation branch/PR must start from current
main, carrying these planning changes without silently folding deployment-log PR #156 into it.

## Verification required after approval

- Migration fixtures: linked, unlinked, archived, duplicate/conflicting entries, pending invitations, two clubs, removed membership, role changes, historical log and measurement preservation; reconcile counts and semantic recipient/seat mappings before and after.
- Applications/multi-club tests: verified/unverified and account-only users, concurrent duplicate/approval/rejection/revocation, account enumeration, roles differing per club, concurrent tabs and switches, stale responses/media writes, first-club mapping and existing-session upgrade/rollback.
- API and direct RLS tests: additive club roles, global-role escalation denial, private note assignment/direct/crew sharing, revoked users, foreign-club IDs and existing training ownership/media boundaries.
- Provisioning/concurrency: invitations before first login, exact identity linking, concurrent profile/role/access changes, active sessions and revision/audit behavior. Club admins cannot assign or remove platform authority.
- Browser regressions: remove Rowers navigation/direct access/inline creation; one user flow; lineup, note filters/assignment/sharing, angle labels and admin settings. NL/EN, iPhone WebKit and laptop 1000×540; touch targets and overflow measured.
- Run repository PR checks, worker checks, full local and edge suites plus local deploy/rollback rehearsal. Retain security review note in the eventual implementation PR.

## Approval boundary

The product choices above are confirmed; do not ask Ewout to choose them again. The expanded work
now includes new application/platform-authority storage and a global-auth/multi-club transition.
Ewout approved implementation with "ja uitvoeren". Local work uses three additive migrations and
paired feature flags, with explicit legacy mapping and deferred contract cleanup. No production
change, real invitation, merge or deployment is authorized. See BUILD.md and TEST.md for progress.


## Implementation and verification result

The approved core is implemented on `codex/feat/unified-club-users`: migrations 0020–0022,
flagged account/club flows, preserved legacy proofs/history, canonical references, explicit mapping,
club-scoped roles and separately protected full platform authority. Tests: 540 web/DB, 50 worker,
6 local and 6 proxy new-flow laptop/iPhone cases; final regression/PR status is in docs/HANDOFF.md.
The 7 real historical people must acquire verified accounts and be explicitly mapped by an admin;
no automatic identities, new privileges or data deletions were invented to complete this rollout.
Physical removal of old compatibility identifiers and club branding remain subsequent changes.
