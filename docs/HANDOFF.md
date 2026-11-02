# RowLens handoff — 2026-11-02

Read `AGENTS.md` first. The repository and production have moved well beyond the 2026-11-01 auth
handoff that used to be in this file; `DOCUMENTATION.md` remains the detailed newest-first log.

## Current repository state

- `main` / `origin/main`: **`fd8b19c`**, the Dutch-by-default interface and language switch from
  #124, on top of the Classical sessions UI and coach/rower workflow.
- Current worktree: **`codex/feat/106-notes-in-video`**, pushed and clean after PR #125.
- Local stack: Postgres on 5434, worker and the Vite/API development processes are running. The edge
  stack was stopped after its tests.
- Production: **`sha-96a0202`**, deployed 2026-11-02. Do not deploy again without Ewout's explicit
  approval; do not infer approval from that earlier deploy.

## Open product PR

**#125** `feat(notes)`: notes and drawings inside the video (#106), remembered on/off and hold
controls, shared rower filter, and server-controlled account/roster author names. PR #124 was merged
without deleting its branch; #125 is retargeted to `main` and remains mergeable.

Wait for the fresh post-retarget CI run, then merge #125 only when Ewout asks. Nothing is authorised
to deploy merely because the PR is ready.

Older documentation PRs #83, #89 and #117 are still open with conflicts and are not in this product
stack. Dependabot's major Node 26 and Python 3.15 PRs (#72/#73) should still be closed rather than
merged; see the older log for the remaining dependency PRs.

## What #125 contains

- Notes, explanation text and drawings appear together inside the video. They remain for a saved
  0.5/1/2-second hold (default one second); a dark card automatically chooses the corner furthest
  from drawing points.
- The eye button and `N` toggle are remembered per device. The video and side panel share the same
  all/mine/rower filter; hidden moments also leave the timeline markers.
- The overlay lives inside the stage, including native fullscreen and the iPhone immersive fallback.
- The free author field is gone. Within the tenant transaction the server uses the linked roster name,
  falling back to the account display name, and ignores a spoofed client name. The rollback-only
  pilot path still requires a validated label.

## Verification for #125

- Format, lint, typecheck and production/edge builds passed.
- 385 web tests and 44 worker tests passed.
- 38 local player/smoke E2E and 21 edge E2E passed (the edge run skips eight demo-only player tests;
  those passed in the local run).
- WebKit measurements: phone 390×844 stage 358×201; iPhone immersive fullscreen stage 374×201;
  low laptop 1000×540 stage 427×240. The overlay stayed inside the video and no page overflowed.

## Suggested next work

1. Have Ewout review #125 locally; merge only on request after the post-retarget CI run is green.
2. Continue the coach/rower workflow: a cross-session “My notes” view (#109), then notifications,
   annotation status/auditability and quota hardening.
3. Stroke marking (#85), thumbnail strip/retry, and real-device Android/4K checks remain open.

Production commands, secrets handling and neighbour checks remain in `AGENTS.md` and
`docs/runbooks/server-setup.md`. Never send user video, names or e-mail addresses to an external AI
provider.
