# RowLens handoff — 2026-11-07

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
newest-first detailed log. Update this file at the end of a session.

## Pending proposal — complete user directory and identity editor

- Ewout now requests table/list users, per-field filtering/sorting, full name/email/role/preference
  editing and own-club users/requests for club admins versus all users for RowLens admins.
- Concrete proposal: `docs/plans/user-directory-and-account-editor.md`. Email is currently immutable
  and global-role assignment operator-only. Proposed migration 0024 adds protected pending verified
  email changes, global-role safeguards and scoped directory/detail fields; no new dependency.
- Await architecture approval before implementing that expansion (AGENTS.md). No application,
  database, account or production changes were made in the planning turn. Existing implementation
  below remains locally available; no merge/deploy authorization.

## Current follow-up — Users page and zero-or-more club memberships

- Included in PR #157 on `codex/feat/unified-club-users`. Ewout requested a Users tab: all accounts
  for RowLens admins, only current-club members for club admins; accounts may have zero or more clubs.
- `/users` is now separate navigation, protected for administrators. Platform mode uses the existing
  protected global verified-account directory, optionally combined with selected-club role controls.
  Club mode uses only the tenant member API. Users outside the selected club get account settings,
  without invented club roles; explicit admission is available when a club is selected.
- Clubs no longer embeds a global user-settings selector; its verified-user dropdown remains only
  for appointing a club administrator. Club administration now holds Requests and Roles. Legacy
  feature-off administration remains compatible. No new table, migration or dependency.
- BUG-046 fixed: global account settings no longer require a selected club for platform actors.
  Only the exact administrative settings route gets this account scope; club admins retain tenant
  validation and SQL membership checks. Read/save audits contain actor/target UUIDs and commit with
  settings work; revision conflicts do not create a successful-save event.
- Checks: 546 full web/DB tests, 38 focused authorization/settings tests, 10 laptop/iPhone WebKit
  cases, 6 legacy admin/settings browser cases and lint/typecheck/format/build pass. Prior proxy,
  worker and migration/rollback evidence belongs to the preceding archive change; not rerun here.
  Local :5174 remains healthy with 24 migrations. Refresh `/users` to review. No production change,
  merge or deployment authorization; CI for the new head is on PR #157.

## Current follow-up — club administration and reversible club archiving

- On branch `codex/feat/unified-club-users`, included in PR #157. Ewout requested members/roles and
  admission under Club administration, full club management under Clubs, and approved archiving
  with restoration: "Ja, archiveren en kunnen herstellen" (ADR-0022; migration 0023).
- Club administration has Club members, Requests and Roles tabs. Unified member lists exclude
  unused allowlist addresses; all actual memberships are listed and membership-only roles editable.
  The platform Clubs directory includes archived clubs and inline-confirmed archive/restore.
- Archive denies new club content/API/direct tenant SQL and applications; accounts, other club
  memberships, pending requests and history remain. Restore re-enables the same club and memberships.
  Background jobs can finish; no permanent deletion or branding was added.
- Latest checks: 545 web/DB, 50 worker + Ruff/mypy, 8 laptop/iPhone WebKit cases, 49 legacy local
  browsers (57 skipped), 39 proxy browsers (14 skipped), 77 deploy checks and real local migration/rollback rehearsal pass. Edge stopped with data retained. Schema
  consistency passes. TEST.md records a Testcontainers startup timeout followed by an 8/8 rerun.
- Local dev readiness is healthy, now **24 migrations**. Refresh `/admin` and `/clubs` for review.
  No real club was archived by the agent; lifecycle tests use synthetic clubs. Production remains
  unchanged. No merge/deploy authorization; latest CI status is on PR #157.

## Current task — unified users and multi-club admission (2026-11-07)

- Operator bootstrap BUG-044 is fixed: audit parameter explicitly typed UUID before conversion to
  text. The real CLI reproduced 42P08 before the fix; 20 focused CLI/authorization tests pass after.
  Operator should rerun `bash scripts/admin/grant-platform-admin.sh` with hidden verified email;
  the original failed transaction rolled back. No real account was granted by the agent.

- PR [#157](https://github.com/ewoutbarendregt/rowlens/pull/157) is open and mergeable. All eight jobs in CI run 42368522411 succeeded, confirmed on 2026-11-07 after “ga door”. Local readiness reports database health. Next is operator local review/bootstrap with the hidden terminal prompt below; historical mappings require real account selection. No merge/deploy authorization.
- Ewout approved with "ja uitvoeren". Branch `codex/feat/unified-club-users`, from main 799dfbe;
  planning docs copied without incorporating separate deployment-log PR #156. Production remains
  sha-799dfbe, as previously explicitly deployed; no new merge/deploy is authorized.
- Implemented paired-feature-flag account requests/verification, account-only sessions/settings,
  club applications/admission, multi-club context and UI, separate global RowLens authority/full
  private-content access, club create/rename/initial admin, and WVIJburg display name with old IDs.
- Migration 0020 adds protected global auth/platform storage and tenant applications; 0021 adds
  canonical account refs with same-club derivation/backfill. Existing IDs, sessions and history are
  preserved. Production read-only preflight: 7 roster people, all unlinked; 10 seats, 1 assignment,
  0 shares, 1 historical log and 8 angle measures. Admin explicit mapping UI waits for real verified
  accounts/admission and refuses collisions. Do not invent accounts, infer matches or drop history.
- Platform bootstrap is `bash scripts/admin/grant-platform-admin.sh`: hidden terminal email prompt,
  owner connection and existing verified account. Existing server admins are not auto-promoted.
  Logos/club interface design remain deferred. Flags default off for production; local dev runs on.
- Final guard hardening rejects content reads/writes without an explicit club when several clubs are available; account-only operations and single-club compatibility remain. Focused 18 integrations + 6 laptop/iPhone cases pass. CI status for the new head is on PR #157.
- PR CI run 42367425246 exposed an upload reply-before-COMMIT race (BUG-042; web 538 pass/2 fail). Fixed with a deterministic deferred-commit test; local uploads 13/13, full suite 541/541 and 6 upload/permissions browser cases pass. The next CI run 42368018365 passed web and deploy-script; do not use the earlier failed run as release evidence. Check the latest PR head for current status.
- Final checks: **541 web/DB** (18 unified cases + upload commit regression), **50 worker** with Ruff/mypy, format/lint/typecheck,
  feature-on build and schema consistency pass. Local unified **6/6** and proxy **6/6** (1000×540
  Chromium + iPhone WebKit) pass; screenshots and >=44 px/no-overflow checks inspected. Legacy
  local **49 pass/53 skipped**. Legacy proxy first run **38 pass/1 transient lineup fail/12 skipped**;
  targeted repeat **1/1** passed, followed by final full **39 pass/13 skipped**, no failures. Deploy-script **77** and real
  Docker deploy/rollback rehearsal pass. See TEST.md for failed diagnostic iterations as well.
- Local dev :5174/API :3100 is healthy, UNIFIED_USERS=true, **23 migrations**. Unreleased function
  definitions were refreshed locally as SQL evolved; fresh DB tests/rehearsal validate migration
  application. Edge is stopped after final regression, with data retained.
- Global bootstrap: existing server admins remain club admins. The local operator runs
  `bash scripts/admin/grant-platform-admin.sh` after signing in once; hidden input and protected
  owner connection keep the address out of chat/arguments. No production bootstrap was run.
- Older task snapshots below are historical and do not authorize another release.

## Current task — #154, club-wide reading and role-based editing

- Ewout approved the revised plan and its one policy migration: "voer het plan uit".
  Branch `codex/feat/154-club-training-readonly`, based on main `b000ca4`; implementation local.
- All roles read all current-club trainings. Rower-only writes remain creator-owned, not crew-owned;
  foreign trainings are fully read-only, including old own feedback, assignment and sharing.
  Coaches/admins edit every club training; combined roles retain elevated rights. Private feedback
  stays private to rowers, and creator/account administration stays admin-only. See ADR-0020.
- Migration 0019 (20 total locally) separates read/write RLS. APIs return resource capabilities and
  pre-authorize media effects under a parent lock with a fresh ownership recheck after lock waits.
  BUG-032 regression reproduces a concurrent creator-transfer/upload race, then passes after fix.
- Ready in PR [#155](https://github.com/ewoutbarendregt/rowlens/pull/155). Final code is 44b4062 plus
  verification documentation; check current CI on the PR. No merge/deploy authorization.
- BUG-034 compatibility is included in the same migration: new `withTenant` transactions set fixed
  `app.training_permissions=owner-or-staff`. Absent context keeps the prior role-set-aware image's
  aligned legacy read/write scope during upgrade/authorized rollback; unknown modes deny training
  access. No second migration/table/dependency, server reconfiguration or coordinated stop is needed.
  Scalar-role images remain incompatible with ADR-0019. Legacy/new contract tests pass together.
- Final verification after that change: 522 web/DB (30 new permission cases), 50 worker with Ruff/mypy,
  format/lint/typecheck/build, schema-generation consistency, 77 deploy-script tests and repeated
  real local deploy/rollback rehearsal pass. Full local E2E 49 passed/49 skipped; full edge 39 passed/
  10 skipped. Local phone/1000×540 matrix 6/6; edge matrix 14/14 (permissions/live roles/private
  feedback, angle measurements, line movement, 0.25×/0.5×, pause and inline stroke tools).
  Screenshots inspected; no document overflow. Earlier diagnostic runs are retained in TEST.md.
- Local dev :5174/API :3100 is healthy with 20 migrations. Its already-applied 0019 helpers/policy
  were updated non-destructively with data retained; edge bootstrapped the revised migration on a
  fresh test database and is stopped after verification. No local check is running; dev stays on.
  Next: Ewout tries the local stack. Merge/deploy require new explicit requests.
- Production is **sha-b000ca4**, #152 merged/deployed 2026-11-06 18:18 UTC, verified healthy with
  19 migrations and retained accounts/sessions. Deployment log PR **#153** is separate and open;
  older #148/#150 and the OWASP review branch remain untouched. No merge/deploy authorization
  carries over to #154. No production changes were made.
- The sections below are earlier snapshots from main. This current section supersedes their older
  production/task status; deployment evidence is in #153. Do not repeat that deployment.

## Admin user settings implementation — #151

- Approved by Ewout: "Ok voer maar uit". Branch `codex/feat/151-admin-user-settings`, based on
  main `e5960c7` plus the three approved proposal commits. No new merge/deployment authorization.
- One global account/profile and five central display/video preferences; seven non-empty role
  combinations. Current-club admins inspect/edit accounts; unknown preferences remain explicit.
  User e-mail remains read-only. Additive role arrays replace scalar grants (migration 0018);
  settings writes use revisions, protected SQL functions and a scoped immutable admin audit.
- Rower-only: Trainings and own settings; no standalone Rowers directory or roster writes. API/RLS
  enforce this; scoped crew names omit e-mails and identify only the current member with `mine`.
  Existing permitted note sharing, assignment and lineup interactions remain.
- Client account caches are isolated; late responses are ignored, legacy device import requires
  confirmation and fills only null fields. Focus/reload sync does not remount the player. Open
  profile/admin drafts cannot silently overwrite newer changes. Transport/server failures preserve
  the last confirmed auth state; explicit access denial still closes it (BUG-030). ADR-0019 records the decision.
- Unsaved role choices retain their original conflict snapshot through profile/list refreshes
  (BUG-031). Explicit reload/cancel discards the draft; stale saves report a conflict.
- Verification: 492 web/DB + 50 worker tests, format/lint/typecheck/build, 77 deploy-script tests and
  Docker rehearsal pass. Full local E2E: 47 passed/49 skipped; full edge: 38 passed/10 skipped.
  Local low-laptop/iPhone settings matrix: 6/6; edge regression matrix: 24/24 (settings, playback,
  angles/drawing, stroke controls). Screenshots inspected; 44 px controls and no document overflow.
  Final outage/rejection checks: 12 Chromium + 10 low-laptop/iPhone cases pass.
  Separate output paths avoid Playwright trace collisions. PR [#152](https://github.com/ewoutbarendregt/rowlens/pull/152) is open against main; The PR carries the current CI status; no merge/deploy is authorized.
- Production stays `sha-e5960c7` (deploy 42195631449). Separate log PRs #148/#150 and the local
  OWASP review branch remain separate. Local dev :5174 is migrated and running (19 migrations); edge is stopped after tests. Oar arc/stern camera remain deferred.

## Inline stroke controls — 2026-11-06

- Current work: `codex/feat/85-inline-stroke-tools`, based on `main` `ddb90fd`; pending PR review.
  No merge/deployment is authorized for this new change. Production stays `sha-ddb90fd`.
- Per Ewout's screenshot/clarification, the separate mark editor is replaced by a trash action on
  each stroke row. Open it, choose one catch/finish/half-slide moment, then confirm inline. Never
  delete the whole stroke; exclude the next catch. Loose marks stay individually removable.
- ↓ Catch / ↑ Finish tools sit immediately above the picture, with Notes open too, on phone and
  in fullscreen. They pause, exit point placement and toggle the current frame's mark; keyboard
  support and pointer-release activation are retained. No API, schema, dependency or role changes.
- Table layout/44 px actions and fullscreen contrast were checked; BUG-027 records the prototype's
  internal table scrolling, corrected before review. Final matrix: 12 passed across laptop,
  1000×540 and iPhone WebKit; 451 web / 50 worker tests; full edge 36 passed (10 skipped).
  Local E2E: 43 passed (49 edge-only skipped); 2 isolated iPhone visual checks passed.
  See TEST.md for diagnostic iterations.
- Local dev stays available on :5174; edge is stopped after final visual verification.
- Deployment log PR #148 is still separate; the local OWASP review branch
  `codex/docs/owasp-security-review` is preserved and is not part of this UI change.

## State

- `main`: **`ddb90fd`**, including merged PRs [#144](https://github.com/ewoutbarendregt/rowlens/pull/144),
  [#145](https://github.com/ewoutbarendregt/rowlens/pull/145),
  [#146](https://github.com/ewoutbarendregt/rowlens/pull/146) and
  [#147](https://github.com/ewoutbarendregt/rowlens/pull/147).
- Production: **`sha-ddb90fd`**, deployed 2026-11-05 23:41 UTC (2026-11-06 00:41 CET),
  [run 42131217348](https://github.com/ewoutbarendregt/rowlens/actions/runs/42131217348).
  Final main CI 42128677789 and images 42128677869 passed. Readiness: expected version and DB ok;
  five public URLs returned 200. Web/worker use the new tag; 18 migrations. The deploy recreated
  the RowLens DB container (healthy, PostgreSQL 16.15); five shared-service container IDs and
  start times are unchanged. The standard pre-deploy backup succeeded.
- Merge order was #144 → #145 → #146 → #147, preserving lower branches while retargeting each next
  PR. Squash conflicts were resolved using the repository procedure, keeping each reviewed tree;
  fresh CI passed before every merge. Final main is byte-for-byte equal to tested source `cdd51ee`.
- Database: 18 migrations; this release adds no migrations, dependencies or permission changes.
- Deployment log branch: `codex/docs/147-production-deploy`; docs only, not authorized for a later
  merge or deployment by this session's instruction. Production verification is complete.
- Local stack: dev Postgres :5434 + worker and web :5174. Edge was stopped after E2E; keep its data.

## Changes in the merged release

- #144 / BUG-021: drawing and measurement controls below the picture, also in fullscreen; explicit
  44 px buttons/selects leave points unobstructed on iPhone and low laptop windows.
- #145 / BUG-022: speed and play/pause activate once on valid pointer release, preserving keyboard
  activation; drawing drags release capture on up/cancel and clear abandoned drags on lost capture.
  This fixes a reproduced missing-click failure mode. The original physical iPhone gesture is not
  fully reproduced: keep BUG-022 in progress until Ewout confirms 0.25×, 0.5× and pause after drawing.
- #146 / BUG-023: Halen / Strokes has an expandable mark editor. Catch, finish and half-slide marks
  can be deleted explicitly with inline confirmation, independently of the playback cursor.
- #147 / BUG-024: first drawing point appears immediately; no point-progress menu between taps.
  After all two or three points, adjustment, Save/Redo/Cancel and measurement choices remain.

## Validation and limits

- Format/lint/typecheck/build, 451 web tests and worker checks / 50 tests passed. Latest combined
  source: 43 local E2E passed (47 edge-only skipped), 35 full edge passed (10 skipped).
- Focused checks passed on 1440×900, 1000×540 and iPhone 13 WebKit: editing/playback 33; stroke-mark
  deletion NL/EN 9 plus 3 final target-size checks; drawing/angle point placement 15. Details and
  earlier transient quota/setup failures are in TEST.md and the PR descriptions.
- WebKit uses native touch taps; Playwright's mouse API supplies dragging. Physical iPhone finger
  dragging and the originally reported playback sequence remain unverified.
- CI infrastructure BUG-025: Ubuntu package downloads intermittently stall before browser tests.
  Affected jobs were retried on fresh runners, preserving successful checks. No tests or CI gates
  were weakened. The release workflow's known permission failure is unrelated and harmless.

## Earlier production features retained

- Saved drawings, angle measurements and coach/automatic boat lines can be selected and moved by
  dragging their point rings. Drawings show on their own frame; measurement rower/joint chosen in
  the picture (#142, ADR-0017 addendum).
- Angles per rower/phase and crew differences (ADR-0017); worker boat-waterline tracking with
  OpenCV, no external model; a coach correction wins on its frame and restarts tracking (ADR-0018).
- Stroke timings, previous/next stroke moment, zoom, account names/default boat, session renaming
  and videos first on the session page.

## Open and next work

1. Await architecture approval for #151; the concrete proposal is above. #149 is already deployed
   as sha-e5960c7 (see deployment-log PR #150), so do not repeat that merge/deploy.
2. Confirm on a physical production iPhone: create/edit a line and angle, tap 0.25× / 0.5× and pause;
   verify selected speed and actual playback. Confirm moving points with a finger, deletion of
   catch/finish marks and direct drawing without the progress menu. Basics remain the priority.
3. Other open bugs: BUG-012 and BUG-017 (WebKit E2E flakes), BUG-014 (merging roster entries across
   sessions the merger cannot see), BUG-015 (tools wrap at 1000 px with classic scrollbars), BUG-016
   (picked rower sometimes missing after lineup save) and BUG-025 (CI package downloads).
4. "My notes" across sessions (#109) and notifications remain later work.
- **Deferred by Ewout**: oar arc and stern-camera perspective (#127, 2026-11-04 comment). No go-ahead.
  First needs a stern-camera sample on the local stack; the proposed `oar` enum migration needs
  architectural approval. No work on this in the merged release.
- Boat speed/acceleration needs the club's sensor-device decision; ghost riders after a pose spike.
- Leave unrelated old docs PRs #83/#89/#117 and Dependabot #74–#79 alone; #72/#73 (Node 26/Python
  3.15 images) should not be merged as part of this work.

## Working agreements

- Dutch or English matching Ewout; short reports with numbers, limits and PR links. Verify iPhone
  WebKit and ~1000×540. Local review by default; merge/deploy only when explicitly requested each time.
- One PR per change; no direct commits/pushes to main. No shared-server or configuration changes.
- WebKit compatibility clicks can target a newly mounted element; SVG non-scaling strokes can break
  small hit areas in Chromium. Keep both browser engines covered (BUG-018/019).
