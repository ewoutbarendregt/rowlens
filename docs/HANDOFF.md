# RowLens handoff — 2026-11-02

Read `AGENTS.md` first. The repository and production have moved well beyond the 2026-11-01 auth
handoff that used to be in this file; `DOCUMENTATION.md` remains the detailed newest-first log.

## Current repository state

- `main` / `origin/main`: **`ee73740`**, notes and drawings inside the video (#125) on top of the
  Dutch-by-default interface and language switch (#124).
- Current worktree: **`codex/docs/deploy-ee73740`**, used only to record the completed deployment.
- Local stack: Postgres on 5434, worker and the Vite/API development processes are running. The edge
  stack was stopped after its tests.
- Production: **`sha-ee73740`**, deployed 2026-11-02 at 20:51 UTC. The public readiness endpoint
  reports that version with its database check healthy; the trustable.nl, API and AudioScribe
  neighbour checks all returned 200. Do not deploy again without Ewout's explicit approval.

## Product PR state

PR #124 (interface language) and PR #125 (notes in the video) are merged. There is no open product PR
in this stack; only the deployment-log documentation belongs after `main` now.

Older documentation PRs #83, #89 and #117 are still open with conflicts and are not in this product
stack. Dependabot's major Node 26 and Python 3.15 PRs (#72/#73) should still be closed rather than
merged; see the older log for the remaining dependency PRs.

## What the latest release contains

- Notes, explanation text and drawings appear together inside the video. They remain for a saved
  0.5/1/2-second hold (default one second); a dark card automatically chooses the corner furthest
  from drawing points.
- The eye button and `N` toggle are remembered per device. The video and side panel share the same
  all/mine/rower filter; hidden moments also leave the timeline markers.
- The overlay lives inside the stage, including native fullscreen and the iPhone immersive fallback.
- The free author field is gone. Within the tenant transaction the server uses the linked roster name,
  falling back to the account display name, and ignores a spoofed client name. The rollback-only
  pilot path still requires a validated label.

## Verification for the latest release

- Format, lint, typecheck and production/edge builds passed.
- 385 web tests and 44 worker tests passed.
- 38 local player/smoke E2E and 21 edge E2E passed (the edge run skips eight demo-only player tests;
  those passed in the local run).
- WebKit measurements: phone 390×844 stage 358×201; iPhone immersive fullscreen stage 374×201;
  low laptop 1000×540 stage 427×240. The overlay stayed inside the video and no page overflowed.
- The `main` images workflow published `sha-ee73740`; deploy run `41522914840` succeeded. Production
  runs the matching web and worker images, and the web container plus database are healthy.

## Suggested next work

1. Continue the coach/rower workflow: a cross-session “My notes” view (#109), then notifications,
   annotation status/auditability and quota hardening.
2. Stroke marking (#85), thumbnail strip/retry, and real-device Android/4K checks remain open.

Production commands, secrets handling and neighbour checks remain in `AGENTS.md` and
`docs/runbooks/server-setup.md`. Never send user video, names or e-mail addresses to an external AI
provider.
