# RowLens handoff — 2026-11-05

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
detailed newest-first log. Update this file at the end of a session (`/handoff` in opencode).

## State

- `main`: **`76adf5b`** (#143 merged after all eight CI jobs passed on updated head `5321da2`,
  run 42062947694). It contains docs and the BUG-020 test fix; application code is still #142.
- Production: **`sha-5ef325b`**, deployed 2026-11-05 14:55 UTC (run 42049743130), 18 migrations.
  Read-only readiness rechecked during this session: expected version, `db` ok. No deployment
  needed for #143; no production or shared-server changes were made.
- Open **PR #144** (`codex/fix/141-unobstructed-editing`), addressing BUG-021: move the drawing and
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

## Playback activation fix (2026-11-05, BUG-022)

- Ewout reports **production iPhone** taps ignored after a line/angle: 1× remains selected when
  tapping 0.25/0.5×; pause sometimes also ignores taps. This is activation, not a confirmed wrong
  media rate. Exact production source `5ef325b` passes 9 normal laptop/WebKit cases locally.
- Open #145 (`codex/fix/bug-022-playback-controls`), based on open #144. Candidate fix:
  `ui/PressButton.tsx` handles speed/play/pause on valid pointer release without requiring a
  compatibility click; keyboard/assistive activation stays supported. Drawing drags explicitly
  release pointer capture on up/cancel and clear abandoned drags on lost capture.
- A WebKit test suppressing compatibility clicks reproduced the ignored-button symptom before the
  fix; it passes afterwards. The initial 12 playback cases passed, including measured slow rates
  and pause after drawing. The final editing/playback matrix passes 33/33 cases; other validation is in TEST.md. The underlying physical
  Safari gesture is not fully reproduced; a physical iPhone check remains necessary.
- #144 remains open/unmerged, all eight CI jobs passed (run 42066230506). The playback fix is
  a separate change stacked on #144; merge #144 **without deleting its branch**, then retarget the
  playback PR to main and wait for its CI. New merge/deploy instructions are required.
- Validation: format/lint/typecheck/build, 451 web + 50 worker, 43 local E2E and 33 editing/playback
  matrix cases passed. Full edge: 32 passed, then 1 upload-quota failure passed on its own after
  restarting only the local edge web container. No product upload limit was changed.
- No production changes. The exact-production image was used on the local edge stack only, via a
  temporary override under `/tmp`; the normal current source was restored and the edge stack was
  stopped after testing. The dev stack remains available on :5174.

## Explicit stroke-mark removal (2026-11-05, BUG-023)

- Current checkout: `codex/feat/85-remove-stroke-marks`, based on open #145
  (`codex/fix/bug-022-playback-controls`), which is based on #144.
- In Strokes, coaches/admins expand "Edit or delete marks". Every stored catch, finish and half
  slide has an explicit Delete action with `ConfirmInline`; deletion targets its frame, including
  marks outside a complete stroke. Errors keep the mark; reload persistence, timeline and timing
  recalculation are covered by NL/EN tests on both laptop sizes and iPhone WebKit.
- Existing current-frame toggle and keyboard shortcuts remain. No new schema, dependencies or
  permissions; the existing DELETE and tenant/role policies are reused. Full checks are in TEST.md.
- Validation: 451 web + 50 worker; 43 local E2E, 35 full edge E2E, 9 NL/EN strokes matrix and
  3 final confirmation-size cases passed. Controls ≥44 px, no horizontal overflow. #145 now has
  all eight CI jobs green (run 42090085510). Edge stopped after testing; dev remains on :5174.
- No merge or deployment was requested for these changes. Merge order when authorized: #144,
  then #145, then this stroke-removal change. Keep each lower branch until the next PR is retargeted
  to main, wait for CI, then continue. The physical iPhone playback report still needs confirmation.

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
