# DOCUMENTATION

Agent work log, newest first.

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
