# RowLens handoff — 2026-11-06

Read `AGENTS.md`, the newest `DOCUMENTATION.md` entry, `PLAN.md`, `BUILD.md` and relevant ADRs first.
This is the current state; earlier implementation/deployment history is in DOCUMENTATION.md.

## State

- `main`: **`b000ca4`**, squash merge of [PR #152](https://github.com/ewoutbarendregt/rowlens/pull/152)
  after all 8 PR checks passed. Main CI
  [42267931272](https://github.com/ewoutbarendregt/rowlens/actions/runs/42267931272) and images
  [42267931362](https://github.com/ewoutbarendregt/rowlens/actions/runs/42267931362) passed.
- Production: **`sha-b000ca4`**, deployed 2026-11-06 **18:18 UTC** (19:18 CET),
  [run 42269355939](https://github.com/ewoutbarendregt/rowlens/actions/runs/42269355939).
  Ewout explicitly authorized this merge/deploy with "doe maar" after asking its status.
  Readiness returns the new tag with DB ok; web/DB healthy, worker running on the new tag;
  all five public URLs return 200. Standard pre-deploy backup succeeded.
- Database: **19 migrations**. Migration 0018 retains all 5 accounts, 5 memberships, 3 access grants
  and 7 active sessions. Role distribution remains 1 admin/4 coaches, with zero invalid role sets.
  The audit table exists. All five accounts' browser preferences remain uninitialized until an
  explicit import/save; this is expected and must not be presented as observed defaults.
- All five shared trustable/AudioScribe container IDs, start times and images are unchanged;
  the RowLens DB container also remains unchanged. No server config or shared-service changes.
- Current checkout/log branch: `codex/docs/152-deploy`, based on `b000ca4`; docs only. No new
  merge or deployment is authorized for it. Separate older deployment-log PRs #148/#150 remain open;
  the local `codex/docs/owasp-security-review` branch is preserved.
- Local stack: web :5174, API :3100, dev DB :5434 + worker; 19 migrations and readiness DB ok.
  Edge is **off**, with its data retained. No application work is in progress.

## Shipped in #152 (#151, ADR-0019)

- One global account/profile/preferences set, with all seven non-empty rower/coach/admin role
  combinations. Admin → Users searches current-club accounts and edits names, default boat,
  roles and all five display/video preferences. E-mail remains the read-only login identity;
  never-signed-in access grants have an explicit account status.
- Rower-only users see Trainings and own settings, with no standalone Rowers directory or roster
  writes. API guards and RLS enforce the boundary; scoped crew names omit e-mails/other user IDs
  and identify only the current member with `mine`. Existing sharing/assignment/lineup rights stay.
- Central preferences are authoritative. Explicit legacy import fills only still-null values;
  account-owned caches and request generations prevent another account's stale data applying.
  Revisions and serialized writes protect admin decisions; administrative changes are audited.
- Focus/reload synchronization preserves the player and open drafts. Transient failures retain
  the last confirmed auth state; explicit rejection still closes access (BUG-030). Profile drafts
  cannot overwrite newer values (BUG-028); role drafts retain their original conflict snapshot
  through profile/list refreshes, until save/cancel/reload (BUG-031).
- New web/worker and migration ship together. Previous scalar-role images cannot run against this
  schema: **no image-only rollback**. See the backup/recovery note in the server-setup runbook;
  any manual DB restore or server change requires a separate approval with exact commands.

## Validation and limits

- 492 web/DB and 50 worker tests pass; format/lint/typecheck/build, worker Ruff/mypy, 77 deployment
  script tests and Docker rehearsal pass. Full local E2E: 47 passed/49 environment-specific skips;
  full edge: 38 passed/10 skips. Main CI and production images passed before deployment.
- Local low-laptop/iPhone settings matrix 6/6; edge low-laptop/iPhone regression matrix 24/24,
  including actual 0.25×/0.5× playback/pause, drawing/angles and stroke controls. Final draft/outage/
  competing-admin scenarios: 12 Chromium + 10 low-laptop/iPhone cases pass. Screenshots inspected;
  editor controls ≥44 px, identity width >200 px and no document overflow (BUG-029).
- Upgrade test covers 0017→0018 backfill, existing bearer sessions and idempotent migration retries.
  Tenant/permission tests include seven role combinations, competing admin demotions, stale OTP
  grants, protected self/server admins, immutable audit and same-account/multiple-club settings.
- Production verification was read-only after the deploy. Interactive admin edits were tested
  locally/edge, not by modifying real production accounts. Physical iPhone finger dragging and the
  originally reported editing/playback sequence still need Ewout's confirmation; Playwright uses
  native touch taps and mouse-based dragging. Keep BUG-022 in progress until that confirmation.
- Use separate Playwright output paths when running local/edge suites concurrently (trace-file
  collisions otherwise). Known WebKit flakes: BUG-012/017; CI package downloads: BUG-025.
  The release workflow's known permissions failure is unrelated and harmless.

## Earlier production basics retained

- #149 (`sha-e5960c7`): trash action on each stroke row chooses one catch/finish/half-slide moment,
  with inline confirmation; never removes a whole stroke or its next catch. Loose marks removable.
  ↓ Catch / ↑ Finish tools sit above the picture, including notes/fullscreen, and pause/exit drawing.
- #144–#147: controls below the picture, pointer-release playback controls, per-moment deletion,
  first drawing point immediately without a point-progress menu. Saved lines, angles and boat
  lines can be moved by their point rings (#142); coach boat-line corrections steer tracking.
- Angles per rower/phase, OpenCV boat-waterline tracking (no external model), stroke timings,
  previous/next stroke moment, zoom, account names/default boat, session renaming and videos first.

## Open and next work

1. Deployment is complete; do not repeat it. Review the docs-only release log separately.
2. Ewout's physical production iPhone check remains: line/angle editing and point dragging, selected
   0.25×/0.5× and actual slow playback, pause, per-moment deletion and direct drawing. Basics first.
3. Other open bugs: BUG-012/017 (WebKit flakes), BUG-014 (roster merge across invisible sessions),
   BUG-015 (tools wrapping with classic scrollbars), BUG-016 (rower after lineup save), BUG-025.
4. My notes (#109) and notifications remain later work.
- Oar arc and stern camera (#127, 2026-11-04 comment) remain **deferred**, with no go-ahead.
  First needs a local stern-camera sample; the proposed `oar` enum migration needs approval.
- Boat speed/acceleration needs the sensor-device decision; ghost riders follow a pose spike.
- Leave unrelated docs PRs #83/#89/#117 and Dependabot #74–#79 alone; do not merge Node 26/Python
  3.15 image upgrades #72/#73 as part of this work.

## Working agreements

- Match Ewout's Dutch/English; short reports with numbers, limits and PR links.
- Explore, short plan, approval before architectural/destructive/production changes. Explicit merge
  and deploy permission each time; no direct main commits/pushes or shared-server changes.
- One PR per issue/change; verify iPhone WebKit and ~1000×540. Inline confirmations, no popups.
- WebKit compatibility clicks can hit newly mounted controls; SVG non-scaling strokes can break
  small hit targets in Chromium (BUG-018/019). Keep both engines covered.
