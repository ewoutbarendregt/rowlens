# RowLens handoff — 2026-11-06

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first, then DOCUMENTATION.md,
PLAN.md, BUILD.md and the ADRs relevant to the task. Keep this handoff current.

## State

- `main`: **`e5960c7`**, merged [#149](https://github.com/ewoutbarendregt/rowlens/pull/149)
  after all eight PR CI jobs passed (42190915814, reviewed head `92818c7`). The merged tree is
  identical to that tested head. Earlier editing fixes #144–#147 are also included.
- Production: **`sha-e5960c7`**, deployed 2026-11-06 09:31 UTC (10:31 CET),
  [run 42195631449](https://github.com/ewoutbarendregt/rowlens/actions/runs/42195631449).
  Main CI 42192694387 and images 42192694385 passed; two web-runner retries were needed for
  package-preparation stalls (BUG-025). Readiness: expected version and DB ok; five public URLs
  returned 200. Web/worker run the new tag; 18 migrations. Standard backup succeeded; the deploy
  recreated only the RowLens DB/web/worker containers. All five shared-service IDs/start times
  remain unchanged. No manual server configuration or shared-service changes.
- Database: 18 migrations. No schema, dependency, analysis-rule or permission changes in #149.
- Current branch: `codex/docs/149-production-deploy`, deployment logs only. Verification is complete;
  a later merge/deploy of the log PR needs a fresh instruction.
- Older deploy-log PR #148 remains separate. Local OWASP review branch
  `codex/docs/owasp-security-review` is preserved and outside this UI release.
- Local stack: development web :5174, API :3100, Postgres :5434 + worker. Edge is stopped; data kept.

## Inline stroke controls (#149)

- Each coach/admin stroke row has a trash action beside Loop. Open it, choose one catch, finish or
  half-slide moment, then confirm inline. Never delete the entire stroke; exclude the next catch.
  Loose marks stay individually removable, including when no catches remain. Reuses the protected
  single-frame DELETE endpoint; failed requests retain the mark and report an error.
- ↓ Catch / ↑ Finish tools immediately above the picture, including phone/fullscreen and with
  Notes open. They pause playback, exit point placement and toggle the current frame's mark.
  Pointer-release activation works without compatibility clicks; keyboard support is retained.
- New actions have 44 px targets; fixed table columns and wrapping headers prevent internal
  scrolling/overlap. Fullscreen selection changes immediately with dark text on light gold.
  BUG-027 records the prototype layout problem, fixed before review.
- Validation: format/lint/typecheck/build; 451 web + 50 worker tests; 43 local E2E (49 edge-only
  skipped), 36 full edge (10 skipped); final 12-case matrix on 1440×900, 1000×540 and iPhone 13
  WebKit. NL/EN deletion, cancel/failure, loose marks, reload, next-catch preservation, pointer and
  keyboard actions, fullscreen, target sizes, table/header bounds and colours are covered.
  Final iPhone screenshots were inspected; TEST.md records diagnostic iterations.

## Earlier release and remaining verification

- #144: controls below the picture, including fullscreen, leave all drawing points available.
- #145: candidate playback activation fix for the production iPhone's ignored speed/pause taps
  after drawing. BUG-022 remains in progress until the original physical-device sequence is
  confirmed; automated WebKit tests reproduce and fix a missing-compatibility-click failure mode.
- #146's separate removal section is replaced by #149's inline per-row moment selector.
- #147: first drawing point appears immediately; no point-progress menu between taps. Adjustment
  and measurement choices appear after all required points.
- WebKit tests use native touch taps; point dragging uses Playwright's mouse API. Finger dragging
  and the originally reported playback sequence still need a physical iPhone check.

## Open and next work

1. #149 is merged and deployed; verification/logging are complete. The separate deployment-log PR
   is for review and requires no production deployment.
2. On the physical production iPhone, try the row trash selector and ↓ Catch / ↑ Finish, then
   0.25×/0.5× and pause after drawing/editing a line or angle. Basics remain Ewout's priority.
3. Other open bugs: BUG-012 and BUG-017 (WebKit E2E flakes), BUG-014 (roster merge across sessions
   the merger cannot see), BUG-015 (tools wrap with classic scrollbars), BUG-016 (picked rower
   missing after lineup save) and BUG-025 (intermittent Ubuntu package downloads in CI).
4. "My notes" across sessions (#109) and notifications remain later work.
- Oar arc / stern camera remain deferred by Ewout. The #127 plan (2026-11-04 comment) first needs
  a stern-camera sample on the local stack; its proposed `oar` enum migration needs architectural
  approval. No new go-ahead and no work on that perspective in this release.
- Sensor speed/acceleration awaits the club's device decision; ghost riders follow a pose spike.
- Leave unrelated docs PRs #83/#89/#117 and Dependabot #74–#79 alone; do not merge #72/#73 (Node
  26/Python 3.15 images) as part of this work.

## Working agreements

- Match Ewout's Dutch/English; short reports with counts and PR links. Review locally by default.
- Merge and deploy only when explicitly requested, each time; no direct commits/pushes to main.
- No changes to shared services or server configuration without the exact command/diff and approval.
- Check iPhone WebKit and ~1000×540. WebKit compatibility-click retargeting and Chromium SVG hit
  areas need both engines covered (BUG-018/019). No browser confirmation popups.
