# RowLens handoff — 2026-11-05

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
detailed newest-first log. Update this file at the end of a session (`/handoff` in opencode).

## State

- `main`: **`b6e18a6`** (jump to the previous / next stroke moment, #139).
- Production: **`sha-b6e18a6`**, deployed 2026-11-05 (deploy run 41799144428): readiness ok with the
  database healthy; trustable.nl and AudioScribe untouched. 18 migrations. Don't deploy again
  without Ewout's explicit request.
- Local stack: Postgres :5434 and worker in Docker (`pnpm dev:up`), web via `pnpm dev` on :5174.
  The edge stack is down.
- GitHub Actions had a billing stop on 2026-11-04 (all jobs "not started"); Ewout fixed it.

## What production contains (recent)

- Stroke marks by the coach (catch, half slide, finish; timings per stroke; arrows under the video;
  optional calculated middle of the drive) — ADR-0016.
- Angles per rower and phase (knee, hip, elbow, upper body against the boat line; crew difference)
  — ADR-0017. Drawing made for fingers (tap to place, drag to adjust, Save).
- The boat line found in every frame by the worker (waterline, OpenCV, no model); a coach's line
  wins on its frame and restarts the search; bow side from a coach line or a one-time choice —
  ADR-0018. On the 5 videos in production it found a line in 4361 of 8292 frames.
- Zoom into part of the picture (pinch, ⌘/Ctrl + scroll, + − 0, corner buttons; drag to pan).
- ⏪ / ⏩ jump to the previous / next stroke moment; off with a hint without marks.
- Names in the account menu, default boat, renaming sessions, videos first on the session page.

## Open

- **Waiting for Ewout's go-ahead**: the oar arc and the stern-camera perspective (plan in the
  2026-11-04 comment on #127): an "Oar" measurement per rower against the boat line at catch and
  finish, arc = sum; joint angles refused for the in-boat perspective; the worker skips the
  waterline search there; "time under water" in the Strokes tab. Needs a stern-camera sample video
  on the local stack. Migration: add `oar` to `angle_joint`.
- **Decision needed**: boat speed and acceleration from sensor data (which device the club uses);
  ghost riders later, after a pose spike (#127).
- Open bugs: BUG-012 and BUG-017 (WebKit-only E2E flakes), BUG-014 (merging roster entries across
  sessions the merger can't see), BUG-015 (tools row wraps at 1000 px with classic scrollbars),
  BUG-016 (a picked rower sometimes missing after saving a lineup; one test cause fixed).
- Open PRs: old docs PRs #83, #89, #117 (conflicting, not in the product stack); Dependabot #74–#79;
  #72/#73 (Node 26, Python 3.15 images) should be closed rather than merged.
- Not yet logged in `docs/runbooks/server-setup.md`: the deployments since `sha-ee73740`
  (they are in `DOCUMENTATION.md`).

## Suggested next work

1. The oar arc and stern-camera perspective, once Ewout says go.
2. "My notes" for rowers across sessions (#109), notifications.
3. Investigate BUG-016 and BUG-014.
