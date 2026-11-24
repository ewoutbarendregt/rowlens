# Handoff — 2026-11-24 (Claude)

## State at the end of the session: local deploys to Contabo, done

- Production is `trustable-contabo` (144.91.87.103, user `deploy`), running **`sha-1b54aa5`
  (0.0.69)**, deployed 2026-11-24 20:17 UTC with `scripts/deploy.sh prod` (first local deploy).
  Hetzner `trustable-prod` is only a Caddy forwarder.
- main is at 0501a1a and later: #205 (local deploy, 1b54aa5), #206 (deploy log), #207 (BUG-077 fix:
  a `docker load` with unpack errors, or whose images cannot create a container, is retried once and
  otherwise stops the deploy before `rowlens-deploy` runs). #207 is merged but not deployed; nothing
  in it runs on the server, it only changes `scripts/deploy.sh` on the Mac.
- Deploy with `scripts/deploy.sh prod` from Ewout's Mac, only on his request; the `deploy` and
  `images` workflows are gone. PR checks run again (billing unblocked).
- The server's `rowlens-deploy` was reinstalled from main with `infra/deploy/install.sh` (2026-11-24
  20:31 UTC); it matches the repo, old copy `bin/rowlens-deploy.bak-20261124T203123Z`.
- `docker logout ghcr.io` was run on Ewout's Mac (BUG-076's stale token is gone). Public ghcr.io
  pulls work; private `ghcr.io/ewoutbarendregt/*` images (trustable.nl, AudioScribe) need a fresh
  `docker login ghcr.io` before pulling or pushing from the Mac.
- Not verified yet: the BUG-077 load check in a real deploy (the next deploy is its first run).
- Left for Ewout: delete the GitHub secret `ROWLENS_SSH_PRIVATE_KEY` and the retired
  `gh-actions-rowlens` key on Hetzner; decide whether `release.yml` (release-please, fails on every
  merge) stays.

# Handoff — 2026-11-21 (Claude)

## Current work: BUG-074, example notes for members of the owning club

- Branch `claude/fix/example-notes-for-members` (worktree `/Users/ewout/src/rowlens-example-notes`),
  from main 66b4692. PR #195 merged as 1a36f75 and **deployed** 2026-11-21 (`sha-1a36f75`, migration
  0033 applied: RLS read policy on `annotation` plus one helper function).
- Ewout's rule: the RowLens admin's notes on an example are visible to everyone; nothing else in the
  permission structure changes.
- Ewout's main checkout is on `codex/fix/club-editor-feedback` with uncommitted Codex work (including
  a local 0027 migration) and a dev DB behind main; left untouched.

# Handoff — 2026-11-17 (Claude)

## Current work: examples in the normal training list

- Branch `claude/feat/examples-in-training-list` (worktree `/Users/ewout/src/rowlens-examples-in-list`),
  based on main 5c2b4d8; PR opened from it. Not merged, not deployed; production stays 0.0.65 /
  sha-a42e2f1.
- Ewout's correction: admin example videos belong in the normal training list with the normal
  (read-only) pages, not in a separate corner under Uitleg. Answers and approval ("Ja, bouwen") are in
  docs/plans/examples-in-training-list.md; ADR-0028/0031 carry amendments. No migration.
- Local review stack for this branch: web http://localhost:5185/projects/rowlens/, API :3125, on the
  copied DB :5436 (32 migrations) that Codex's review stack (5175/3101) also uses. Its env file is an
  ignored copy of Codex's. The launch entry `rowlens-examples-review` was added to the original
  checkout's `.claude/launch.json` for this; remove it when done.
- Not verified: Linux WebKit (CI) for the normal-page note jump (BUG-070 order now applied there);
  a physical iPhone.

The 2026-11-16 Codex handoff below still describes production, invariants and the backlog.

# Handoff to Claude — 2026-11-16

This is the current handoff. Older pending-approval, CI and deploy checkpoints are superseded.
Their history remains in DOCUMENTATION.md and in the previous HANDOFF snapshot at commit5f9f385.

## Start here

Read `CLAUDE.md` → `AGENTS.md`, then the newest DOCUMENTATION.md entry, PLAN.md and BUILD.md.
Relevant decisions: ADR-0028 (visibility/examples), ADR-0029 (sharing), ADR-0030 (publisher feedback),
ADR-0031 (existing example publication), and ADR-0007's BUG-070 playback amendment.
No unfinished implementation or pending product decision remains from the latest user requests.
Await Ewout's next task; do not infer a new implementation project from the backlog below.

## Production and completed scope

- **Live: sha-1a36f75** (2026-11-21, #195) at https://trustable.nl/projects/rowlens/.
- #190 merged as ece7f78: immutable example publisher, safe read-only notes/drawings and corrected
  Linux WebKit paused-frame jumps. #191 merged as a42e2f1: Help create/edit/rename/existing selection.
- Rower visibility remains creator/crew/explicit sharing; default club uses the saved primary club.
  Global examples remain available separately to all verified signed-in users, including clubless users.
- Help lets global RowLens admins create an example, rename its actual training, open its normal
  editor in the owning club, or select an existing club training with explicit inline confirmation.
- Existing publication retains the original training, club and owner. Only the selecting publisher's
  existing/future notes and drawings become example material. Other authors' feedback and source
  layers stay private. Publication is live, not a frozen copy; existing publishers cannot be changed.
  No unpublish workflow was added.
- Migration0031 freezes/backfills the publisher;0032 adds protected publication without new tables.
  Publication requires a live verified global actor and active club, locks/rechecks authority, audits
  the first change, and rejects forged normal writes. The invoker trigger also checks trusted owner
  context; do not casually restore SECURITY DEFINER on that trigger or change function ownership.

## Deployment evidence

Ewout explicitly requested **“Merge en deploy”**. Final main CI43961095292 and images43961095148
succeeded; [deploy43962861520](https://github.com/ewoutbarendregt/rowlens/actions/runs/43962861520)
completed2026-11-16 21:43:25 UTC. Automatic backup:
`/opt/rowlens/backups/pre-deploy-20261116T214314Z-sha-a42e2f1.dump`.

Verified after deployment: public readiness new SHA/DB ok, build-info0.0.65, web/worker image tags,
32 migrations,3 examples/3 immutable publishers. Stored publisher material matched before/after:
162 lines,1 arrow,4 angles. All7 other containers retained exact images and start times, including
RowLens DB and all shared apps. Site/API health/AudioScribe returned200. No configuration or one-off
DB changes were made. Fresh public readiness/build-info were rechecked for this handoff.
Production verification was read-only; authenticated UI interactions are covered by local/CI tests,
not a production OTP/login test. Later deployments need a new explicit request.

## Git state and the remaining documentation PR

- Workspace: `/Users/ewout/.codex/worktrees/training-visibility-plan/rowlens`.
- Current branch: `codex/docs/help-examples-deploy-20261116`, based on main a42e2f1.
- [PR#192](https://github.com/ewoutbarendregt/rowlens/pull/192) is **open**, documentation only:
  deployment logs plus this Claude handoff. Its initial documentation checks passed (changes,
  policy, secrets); application jobs were correctly skipped. Recheck its latest head after this update.
- Everything is committed/pushed at handover. No stash or local implementation work needs recovery.
  The handoff update has its own commit; use `git log -1`/`git status` to confirm the final SHA/state.
- PR#192 has not been merged. This handoff request does not authorize merging it or redeploying docs.
  Use a `claude/<type>/<slug>` branch for a new task, following CLAUDE.md/AGENTS.md. No force pushes.
- Older parent/feature branches may remain; #190/#191 are already merged. Do not repeat the release.

## Validation and the playback detail to preserve

Full combined web/DB **717/717** in67 files; **115/115** local browser cases: Help/visibility15,
unified34, sharing9, general51, reuse6. Coverage includes Chromium1000×540/1440×900 and iPhone13
WebKit. The matching Linux Playwright1.64.1 image additionally passed9 parent example cases.
Format/lint/typecheck and feature-mode builds passed;44px targets and phone/low-laptop screenshots
were checked. Parent/child and final main CI/images were green before deployment; TEST.md has runs.
This handoff changes documentation only: formatting/diff checks are sufficient; no app tests rerun.

BUG-070 was a real decoded-image freeze: scrolling back and seeking in the same click was too early
for Linux WebKit. ExamplePage now allows an intervening paint via two cancellable animation-frame
callbacks. Seeking uses `(n+0.25)/fps`: GStreamer may return the seek time as `mediaTime`, and the old
midpoint rounded to the following frame. The display remains callback-derived. Eight arithmetic
regressions cover24–240fps and millisecond precision; a synthetic canvas fingerprint proves the
actual picture changes. Keep the cancellation, timestamp margin and actual-image assertion.

## Local stack: avoid collisions

Existing review: http://127.0.0.1:5175/projects/rowlens/help, API3101, copied DB5436 with32 migrations.
The ignored local environment was configured for this review; SMTP was disabled. Web HTTP200 and
API DB readiness were rechecked at handoff. The original RowLens stack uses5174/5434; trustable.nl
uses5173/5433. Do not overwrite settings, start another full stack on occupied ports, or migrate a
DB without verifying its target. Claude's preview defaults in `.claude/launch.json` may target the
original stack; inspect before launching. Secrets/admin email stay in ignored env/terminal prompts.

Synthetic Linux probe servers on4186 were stopped. Temporary debug files in
`/tmp/rowlens-webkit-probe` and `/tmp/rowlens-help-*` are optional diagnostics, not required source.
Run builds and browser suites serially: the E2E server caches asset names; rebuilding during a test
causes404s. Concurrent Docker-heavy runs caused one old migration timeout; isolated full reruns
passed. Local E2E data/media must remain synthetic and must not be committed.

## Follow-up limits and backlog

There is no new feature assignment. Ewout can review the live Help controls and frame overlays on
his own account/physical iPhone. Do not send production OTP/email or create production training
fixtures merely to verify this handoff.

BUG-068/070/071/072 are fixed in the deployed work. Existing backlog remains in BUGS.md, including
BUG-069 (intermittent test helper readiness), BUG-022 (physical iPhone playback confirmation),
BUG-055 (shared runtime/security maintenance) and BUG-056 (registration mail receipt after DNS
repair). Their old entries may be stale; verify before acting, and do not treat them as authorization.
Some older BUGS.md lines still say “not deployed”; use the current release evidence above.
Oar/stern-camera analysis remains deferred; no architectural approval is implied.

Never modify/restart shared services, accept bot PR changes, expose user media/names/emails to an
external provider, or bypass tenant RLS. Configuration/shared-server changes require explicit
per-change approval. No new deploy/maintenance approval remains active after the completed rollout.
The release-PR workflow's known failure is harmless; required CI/images/deploy succeeded.
