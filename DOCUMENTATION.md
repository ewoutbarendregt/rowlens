# DOCUMENTATION

Agent work log, newest first.

## 2026-11-01 — Database layer (#31): roles, migrations, withTenant, RLS tests

**Session**: claude/feat/31-database
**Changed**: apps/web/src/server/db/{schema,client,tenant,migrate,migrate-cli}.ts, db/migrations/0000_init.sql, db/test/{global-setup,fixtures}.ts, db/{tenant,schema,readiness}.db.test.ts, apps/web/src/server/{config,config.test,main}.ts, apps/web/{package.json,vitest.config.ts,tsconfig.json,tsconfig.build.json,drizzle.config.ts,.env.example}, package.json, pnpm-workspace.yaml (allowBuilds), pnpm-lock.yaml, .prettierignore, infra/compose/docker-compose.{prod,edge}.yml (migrate service, DATABASE_URL), infra/deploy/test/rehearse.sh, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md
**Summary**: First PR of the upload + manual analysis plan Ewout approved (prod behind an access code; lines/angles, notes, stroke marking). Drizzle + pg with two roles: migrations as `rowlens_owner`, the app as `rowlens_app` (no BYPASSRLS, owns nothing), and `withTenant` setting the club per transaction. First table `club` with RLS. Tested against a real Postgres via Testcontainers, behind the Caddy mirror, and in the deploy rehearsal. Next deploy needs `ROWLENS_APP_DB_PASSWORD` on the server and the compose file reinstalled (runbook), with approval. Also created #84 (access code) and #85 (stroke marking).
**Prompts used**: "I want to start with the basic fucntionality first, the upload and manual analysis of a video"; answers: lines/arrows/angles, notes pinned to a frame, mark strokes; "Prod behind an access code"; "Ok go for it".

## 2026-11-01 — Deployed sha-94af6b0: player demo live on production

**Session**: claude/docs/deploy-player-demo-log
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; GitHub: PR #81 merged; trustable-prod: rowlens web → sha-94af6b0 (deploy run 41309728753)
**Summary**: On Ewout's request ("Deploy to prod", demo included) merged #81 after green CI, built sha-94af6b0 with the player demo, and deployed it with the public check on. The deploy took the first real pre-deploy DB dump. Verified: https://trustable.nl/projects/rowlens/demo/player serves 7 synthetic clips with range requests; in the browser over the internet the first frame was ready in 159 ms and 50/50 steps were exact (median 16 ms). trustable.nl, its API and AudioScribe still 200; disk 47 %. Development continues locally; deploys only on request.
**Prompts used**: "Deploy to prod".

## 2026-11-01 — Player demo enabled in production images

**Session**: claude/feat/51-player-demo
**Changed**: apps/web/Dockerfile (demo-media stage, VITE_FEATURE_PLAYER_DEMO build arg), .github/workflows/{images,ci}.yml, BUILD.md, DOCUMENTATION.md
**Summary**: Ewout asked to deploy and chose to include the player demo. The image can now generate the synthetic demo clips in a build stage (no laptop files) and build the SPA with the demo flag; main's images do so. Verified locally on linux/amd64: page 200, 7 clips, range requests 206, image 143 MB. Off by default in the Dockerfile; CI keeps proving the off state has no demo code.
**Prompts used**: "Deploy to prod" → chose "Placeholder + player demo".

## 2026-11-01 — Player demo (#51 spike): frame-accurate player, demo clips, measurements

**Session**: claude/feat/51-player-demo
**Changed**: apps/web/src/client/player/{frames,usePlayer,useHoldRepeat,strings}.ts, Player.tsx (+ frames.test.ts), apps/web/src/client/pages/{PlayerDemoPage,HomePage}.tsx, apps/web/src/client/{App.tsx,features.ts,vite-env.d.ts,styles.css}, apps/web/vite.config.ts (unreachable-chunk drop, API_PORT), apps/web/e2e/{player.spec.ts,smoke.spec.ts,tsconfig.json}, apps/web/{tsconfig.json,package.json}, scripts/demo-media/{generate.sh,Dockerfile}, package.json (demo:media), .gitignore, .dockerignore, .claude/launch.json, .github/workflows/ci.yml, docs/adr/0007-upload-transcode-playback.md, BUILD.md, CLAUDE.md, FEATURES.md, TEST.md
**Summary**: Built the core player locally behind a build flag: 0.25/0.5/1×, ±1 frame, ±0.1/1 s with hold-to-repeat, loop in/out, fullscreen with an iPhone fallback, keyboard, and a demo page with start/step measurements on generated clips that show their frame number. Desktop results: 0 wrong frames, ~16 ms per step, loop within 2 frames, identical across GOP variants. Testing found and fixed four bugs (loop overshoot, ms-rounded timestamps, stale step target, demo code in prod bundle). Also: home page shows "v" only for semver. No deploy (local-only iteration).
**Prompts used**: "lets iterate locally first without the deployments to the server"; "Player demo first".

## 2026-11-01 — RowLens public at trustable.nl/projects/rowlens; no staging environment (#24, #26)

**Session**: claude/docs/26-first-deploy-log
**Changed**: docs/adr/0002-hosting-and-isolation.md, docs/runbooks/server-setup.md, scripts/github/backlog.toml (staging story removed), .github/workflows/deploy.yml (input text), FEATURES.md, DOCUMENTATION.md; GitHub: trustable.nl#377 merged into develop, release trustable.nl#378 (v0.19.1) merged into main; rowlens issues #24, #26 closed, #27 closed as not planned
**Summary**: Released the Caddy route through trustable.nl's pipeline (develop → its staging deploy → main → its prod deploy). https://trustable.nl/projects/rowlens/ now serves RowLens sha-1acc1a2; trustable.nl, its API and AudioScribe verified 200, RowLens containers unaffected by trustable's redeploy. trustable's ci-regression check fails on every release since May (Playwright can't install Chromium on the ubuntu 26.04 runner) and was not a blocker. Ewout pointed out that the trustable staging redeploy wasn't asked for: RowLens has **no staging** — local dev and prod only; staging plans removed.
**Prompts used**: "Yes, release it"; "why are we deploying to staging, i did not ask for that. we will have a local dev version and prod on trustable.nl only".

## 2026-11-01 — First production deploy (sha-1acc1a2) and stack merged to main (#26)

**Session**: claude/docs/26-first-deploy-log
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; GitHub: PRs #67–#71 merged into main (merge commits), issues #23 and #25 closed; on trustable-prod: Compose project `rowlens` (web + db), volume rowlens_db_data, network rowlens_internal, rowlens-web attached to trustable_proxy, /opt/rowlens/state/{current-tag,release.env}
**Summary**: Merged the stacked PRs in order. Deleting #67's branch made GitHub close #68 rather than retarget it; restored the branch, reopened #68 and merged the rest by retargeting each to main first (lesson: in a stack, retarget before merging and delete branches only at the end). The images workflow pushed sha-1acc1a2, and the deploy workflow (public check off, since trustable.nl#377 isn't merged) brought up web + db: healthy, reachable from trustable's Caddy via the `rowlens-web` alias, no registry credentials left, trustable containers untouched. Open: release-please can't create PRs (repo setting), merged branches not yet deleted, Dependabot #72/#73 propose Node 26 / Python 3.15 against our pins.
**Prompts used**: "Yes, merge them"; "It's green, merge"; "Approve #26".

## 2026-11-01 — install.sh run on trustable-prod: deploy script installed, CI key restricted (#25)

**Session**: claude/feat/25-manual-deploy
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; on trustable-prod: /opt/rowlens/bin/rowlens-deploy, /opt/rowlens/docker-compose.yml, /opt/rowlens/state/, the gh-actions-rowlens line in /home/deploy/.ssh/authorized_keys (backup authorized_keys.bak-20261101T115732Z)
**Summary**: Ran the approved infra/deploy/install.sh. Installed files match the repo by sha256; the CI key now only runs rowlens-deploy (verified: status allowed; arbitrary/chained commands, shell, invalid tag and port forwarding refused). Other keys, /opt/trustable and all trustable containers unchanged. No RowLens containers yet.
**Prompts used**: "Approve install.sh".

## 2026-11-01 — #25 Manual deploy: images on main, workflow_dispatch deploy, server script with rollback

**Session**: claude/feat/25-manual-deploy (stacked on claude/docs/23-server-setup-runbook)
**Changed**: .github/workflows/{images,deploy,ci}.yml, infra/deploy/{rowlens-deploy,install.sh,known_hosts}, infra/deploy/test/{run.sh,rehearse.sh,stub/docker}, infra/compose/docker-compose.prod.yml (now web + db), apps/web/Dockerfile (APP_VERSION build arg), docs/adr/0002-hosting-and-isolation.md, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md
**Summary**: Merges to main now build and push sha-tagged images; deploying is a manual, owner-only workflow that SSHes with the CI key into a forced-command script (`rowlens-deploy`) on the server, which pulls with the run's short-lived token, backs up the DB, migrates, starts, checks that web runs the new tag and is ready, and rolls back otherwise. Covered by 71 stubbed checks, a mutation check and a real-Docker rehearsal, all in CI. Nothing installed on the server yet (install.sh needs approval).
**Prompts used**: "Build #25 deploy".

## 2026-11-01 — /opt/rowlens and .env created on trustable-prod (#23)

**Session**: claude/docs/23-server-setup-runbook
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; on trustable-prod: /opt/rowlens (created by Ewout with su), /opt/rowlens/{media,.docker}/, /opt/rowlens/.env
**Summary**: Ewout created /opt/rowlens as root via `su` (no sudo for deploy, no root SSH). I added media/ and .docker/ and generated .env on the server (password never printed). /opt/trustable untouched, disk unchanged at 46 %. Still pending: merging trustable.nl#377. Ewout has since set the ROWLENS_SSH_PRIVATE_KEY secret.
**Prompts used**: "i have the password for root, not deploy"; the user's pasted `su -c 'install -d …'` session output.

## 2026-11-01 — Server setup started: deploy key installed, Caddy route PR opened (#23, #24)

**Session**: claude/docs/23-server-setup-runbook (stacked on claude/test/22-local-edge-stack)
**Changed**: docs/runbooks/server-setup.md (new), BUILD.md, DOCUMENTATION.md; on trustable-prod: /home/deploy/.ssh/authorized_keys (+1 key `gh-actions-rowlens`, backup authorized_keys.bak-20261101-rowlens); local: ~/.ssh/rowlens_deploy{,.pub}; trustable.nl repo: PR #377 (Caddyfile, VERSION 0.19.1, DOCUMENTATION.md)
**Summary**: Executed the approved shared-component changes. The new CI deploy key is installed and verified, existing keys and all trustable containers unaffected. The Caddy route PR is open against trustable.nl develop and not merged. Not done: /opt/rowlens (needs sudo, which deploy can't use without a password), the GitHub secret (the agent may not write secret stores), and .env; the commands for Ewout are in the runbook.
**Prompts used**: "Approve both" (approval of #23 and #24 exactly as shown).

## 2026-11-01 — Local edge stack: RowLens behind a Caddy mirroring trustable.nl (#22, partial)

**Session**: claude/test/22-local-edge-stack (stacked on claude/feat/19-web-app-skeleton)
**Changed**: infra/caddy/{rowlens.caddy,edge.Caddyfile,standin.Caddyfile}, infra/compose/docker-compose.edge.yml, apps/web/e2e/{edge.spec.ts,env.ts,smoke.spec.ts}, apps/web/playwright.config.ts, apps/web/package.json, package.json, .github/workflows/ci.yml, docs/adr/0003-base-path.md, BUILD.md, CLAUDE.md, TEST.md, scripts/github/backlog.toml (#46)
**Summary**: Added a local stack where rowlens-web runs behind a copy of trustable.nl's Caddyfile that imports the exact route proposed in #24, with stand-ins for AudioScribe and the trustable.nl site, plus Playwright edge tests and a CI job. Found that Caddy's body limit is only a backstop and that trustable.nl's Permissions-Policy blocks the microphone for RowLens; both recorded in ADR-0003.
**Prompts used**: "can I test locally before deploying to prod?" → "Yes, add it" (a local Caddy stack that mirrors the prod route).

## 2026-11-01 — #19 Web app skeleton: Fastify + React SPA under the base path

**Session**: claude/feat/19-web-app-skeleton (stacked on claude/chore/17-phase-0-foundation)
**Changed**: apps/web/src/server/{app,config,health,main}.ts (+ tests), apps/web/src/client/** (React SPA), apps/web/src/shared/base-path.ts (moved from src/config), apps/web/{index.html,vite.config.ts,playwright.config.ts,e2e/smoke.spec.ts,tsconfig*.json,src/client/tsconfig.json,Dockerfile,package.json,public/favicon.svg}, eslint.config.js, .github/workflows/ci.yml, BUILD.md, CLAUDE.md, FEATURES.md, TEST.md
**Summary**: Replaced the placeholder HTTP server with the real web tier: Fastify serving health/readiness, a JSON API 404, strict CSP and the Vite-built React SPA with fallback, all under BASE_PATH, with a build-time base path checked at startup. Added Playwright smoke tests (desktop + mobile Chromium) to CI; they caught a non-canonical home link, fixed via a trailing-slash router basename.
**Prompts used**: "Yes, start sprint 1" (sprint plan in docs/phase-0/summary.md; first item #19).

## 2026-11-01 — Phase 0 decisions recorded

**Session**: claude/chore/17-phase-0-foundation
**Changed**: docs/adr/0002, 0003, 0004, 0006, 0010, 0011, docs/adr/README.md, docs/phase-0/summary.md, docs/privacy/processors.md, BUILD.md, CLAUDE.md, infra/compose/docker-compose.prod.yml, scripts/github/backlog.toml; GitHub issues #2, #18, #25, #27, #30, #32, #35, #36, #37, #46, #64
**Summary**: Recorded Ewout's Phase 0 decisions: MinIO on local disk with a 30 GB hard media cap and uploads paused at 85 % disk; no video backup during the pilot; sender rowlens@trustable.nl via Resend; subpath now, own host before club 2; logs only (no error tracker); no branch protection (free private plan), so deploys become a manual workflow_dispatch; LLM provider deferred to M2. ADR-0006 accepted; backlog and issues synced.
**Prompts used**: Answers to structured decision questions in the session (storage "Local disk for now", backups "No video backup yet", sender "rowlens@trustable.nl", origin "Subpath now, move before club 2", media cap "30 GB", errors "Logs only for now", GitHub "No protection, by convention", LLM "Defer to M2").

## 2026-11-01 — Phase 0: server inspection, ADRs, repo scaffold, CI, backlog

**Session**: claude/chore/17-phase-0-foundation
**Changed**: CLAUDE.md, README.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/phase-0/server-inspection.md, docs/phase-0/summary.md, docs/adr/0000–0011, docs/analysis/perspective-rules.md, docs/privacy/processors.md, apps/web/** (base-path module, placeholder server, tests, Dockerfile), worker/** (pyproject, stroke_rate metric, tests, Dockerfile), infra/compose/docker-compose.{dev,prod}.yml, .github/** (CI, release, templates, dependabot), scripts/github/** (backlog bootstrap), root tooling config
**Summary**: Base path is `/projects/rowlens` (changed from the kick-off prompt's `/projects/rowing` at Ewout's request mid-session). Read-only inspection of trustable-prod and the AudioScribe/trustable deploy setup; proposed architecture in 10 ADRs; scaffolded the monorepo with a tested base-path module and a first analysis metric so CI has real targets; created labels, milestones and the M0/M1 backlog (M2/M3 as epics) on GitHub. Nothing deployed; no server changes.
**Prompts used**: the RowLens kick-off prompt (Phase 0 section: "1. Read-only inspection of the server and the AudioScribe deployment … 5. Present a short summary: findings, decisions needing my input, risks, and the proposed first sprint.") pasted as the opening message of the session; mid-session: "contrary to the original prompt, do not use trustable.nl/projects/rowing but trustable.nl/projects/rowlens".
