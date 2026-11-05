# RowLens handoff — 2026-11-05

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
detailed newest-first log. Update this file at the end of a session (`/handoff` in opencode).

## State

- `main`: **`76adf5b`** (#143 merged after all eight CI jobs passed on updated head `5321da2`,
  run 42062947694). It contains docs and the BUG-020 test fix; application code is still #142.
- Production: **`sha-5ef325b`**, deployed 2026-11-05 14:55 UTC (run 42049743130), 18 migrations.
  Read-only readiness rechecked during this session: expected version, `db` ok. No deployment
  needed for #143; no production or shared-server changes were made.
- Current work: **`codex/fix/141-unobstructed-editing`**, addressing BUG-021: move the drawing and
  measurement controls below the picture, inside the fullscreen player too, so no points are
  covered. Explicit 44 px selects/buttons, reload/fullscreen regression checks and a dedicated
  `pnpm --filter @rowlens/web e2e:editing` suite (1440×900, 1000×540, iPhone 13 WebKit).
- Validation: format/lint/typecheck green; 451 web + 50 worker tests; 43 local E2E, 29 full edge
  E2E and 21 focused editing E2E passed. Controls measured 44 px high, zero horizontal overflow.
- This functional fix is for review separately from the authorized #143 merge. It has not been
  merged or deployed. Native WebKit taps are tested; touch dragging still needs a physical iPhone
  check (the tests drag with Playwright's mouse API). BUG-012 remains open.
- Local stack: dev Postgres :5434 + worker, `pnpm dev` web :5174. Edge was stopped after verification
  with `pnpm edge:down`; the dev stack remains available.

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

- **Editing review**: the pending BUG-021 fix moves the measurement bar below the picture and keeps
  it available in fullscreen. Verify on the local stack before merging this functional change.
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

1. Review the BUG-021 editing fix on the local stack; #143 is already merged, without a deploy.
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
