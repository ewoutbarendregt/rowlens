# RowLens handoff — 2026-11-06

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
newest-first detailed log. Update this file at the end of a session.

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
  profile/admin drafts cannot silently overwrite newer changes. ADR-0019 records the decision.
- Verification: 492 web/DB + 50 worker tests, format/lint/typecheck/build, 77 deploy-script tests and
  Docker rehearsal pass. Full local E2E: 47 passed/49 skipped; full edge: 38 passed/10 skipped.
  Local low-laptop/iPhone settings matrix: 6/6; edge regression matrix: 24/24 (settings, playback,
  angles/drawing, stroke controls). Screenshots inspected; 44 px controls and no document overflow.
  Separate output paths avoid Playwright trace collisions. PR [#152](https://github.com/ewoutbarendregt/rowlens/pull/152) is open against main; CI is being checked on its final head.
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
