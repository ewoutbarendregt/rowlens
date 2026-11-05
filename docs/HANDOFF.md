# RowLens handoff — 2026-11-05

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
detailed newest-first log. Update this file at the end of a session (`/handoff` in opencode).

## State

- `main`: **`5ef325b`** (move a saved drawing on the picture; choose its rower there, #141/#142).
- Production: **`sha-5ef325b`**, deployed 2026-11-05 14:55 UTC (deploy run 42049743130): readiness ok
  with `db` ok; trustable.nl and AudioScribe untouched. 18 migrations (that release had none). Don't
  deploy again without Ewout's explicit request.
- **PR #143 open** (`opencode/docs/141-deploy`, checks green): logs the `sha-5ef325b` deployment in
  `DOCUMENTATION.md` and `docs/runbooks/server-setup.md` (also fills in the deployments since
  `sha-ee73740`) and fixes BUG-020, a racy check in `e2e/strokes.spec.ts`. Docs/tests only; Ewout authorized updating and merging it on 2026-11-05.
  Wait for CI on the updated head before merging; no production deployment is needed.
- Working tree clean, nothing else in flight. Last session branch `opencode/feat/141-draggable-drawings`
  is merged and deleted (local copy may still exist).
- Local stack: Postgres :5434 and worker in Docker (`pnpm dev:up`), web via `pnpm dev` on :5174
  (HTTP 200 checked during takeover). The **edge stack was stopped** with `pnpm edge:down` during
  the Codex takeover; its data is retained.

## Codex takeover review (2026-11-05)

- Read the required project docs and ADR-0017/0018, and the 2026-11-04 plan comment on #127.
- Reviewed all six files in #143: no blocking code findings; the catch-navigation test fix agrees
  with `neighbourCatch`. Latest PR head `dcc6cb5`: all eight CI jobs succeeded in run 42058782838;
  nine stroke unit tests also passed locally. No new full E2E, WebKit or layout run during takeover.
- Ewout authorized updating and merging #143; align its description and TEST.md with its actual
  docs/tests scope and successful final CI run, then merge once the updated head is green.
  No production deployment is needed for this docs/tests change.
- Local takeover log is on `codex/docs/143-handoff-review`, based on #143; committed locally only,
  with no new PR. Its commits are being included in #143; production is unchanged.

## What production contains (recent)

- Drawings, angle measurements and the boat line can be moved after saving: a tap selects one (rings
  on its points), a ring drags a point (half speed with a finger), letting go saves it; a
  measurement's rower and joint are chosen in the picture; drawings show on their own frame (#141,
  ADR-0017 addendum).
- Angles per rower and phase (knee, hip, elbow, upper body against the boat line; crew difference) —
  ADR-0017; drawing made for fingers.
- The boat line found in every frame by the worker (waterline, OpenCV, no model); a coach's line wins
  on its frame and restarts the search; bow side once per video — ADR-0018.
- Stroke marks (catch, half slide, finish; rate, drive, recovery, ratio; arrows under the video),
  ⏪ / ⏩ jump to the previous / next stroke moment, zoom into part of the picture, names and default
  boat in the account menu, renaming sessions, videos first on the session page.

## Open

- **Decision for Ewout (asked in #142)**: on a phone the measurement bar (rower + joint + save) needs
  a second row there (~84 px of a 201 px picture). Leave it, move that row under the picture (not
  visible in full screen), or icon-only buttons.
- **Deferred by Ewout (2026-11-05)**: first make editing and moving lines and angles reliable on
  laptop and iPhone. The oar arc and stern-camera perspective (plan in the
  2026-11-04 comment on #127): an "Oar" measurement per rower against the boat line at catch and
  finish, arc = sum; joint angles refused for the in-boat perspective; the worker skips the
  waterline search there; "time under water" in the Strokes tab. Needs a stern-camera sample video
  on the local stack. Migration: add `oar` to `angle_joint`.
- **Decision needed**: boat speed and acceleration from sensor data (which device the club uses);
  ghost riders later, after a pose spike (#127).
- Open bugs: BUG-012 and BUG-017 (WebKit-only E2E flakes), BUG-014 (merging roster entries across
  sessions the merger can't see), BUG-015 (tools row wraps at 1000 px with classic scrollbars),
  BUG-016 (a picked rower sometimes missing after saving a lineup; one test cause fixed).
- Old PRs to leave alone or close: docs #83, #89, #117 (conflicting, not in the product stack);
  Dependabot #74–#79; #72/#73 (Node 26, Python 3.15 images) should be closed rather than merged.

## Suggested next work

1. Finish the authorized update and merge of #143 once its updated CI is green (no deploy needed).
2. Verify and harden creating, selecting, editing and moving lines, angles and boat lines on
   laptop and iPhone WebKit, including zoom/fullscreen and ~1000×540. This is the product priority.
3. "My notes" for rowers across sessions (#109), notifications; investigate BUG-016 and BUG-014.
4. Oar arc and stern-camera work only after the basics are reliable and Ewout gives a new go-ahead.

## Working agreements worth repeating

- Ewout tries changes on the local stack and answers in Dutch or English; report short and concrete
  (what changed, what was checked with numbers, what is not done, PR links). UI is checked on an
  iPhone in WebKit and at ~1000×540.
- Merge only when he says merge; deploy only when he says deploy, each time. One PR per issue.
- WebKit sends a click to whatever is under the finger at release, and `vector-effect:
  non-scaling-stroke` breaks SVG hit areas of small shapes in Chromium: test drawing interactions in
  both engines (BUGS.md BUG-018/019).
