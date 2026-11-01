# DOCUMENTATION

Agent work log, newest first.

## 2026-11-01 — Phase 0: server inspection, ADRs, repo scaffold, CI, backlog

**Session**: claude/chore/17-phase-0-foundation
**Changed**: CLAUDE.md, README.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/phase-0/server-inspection.md, docs/phase-0/summary.md, docs/adr/0000–0011, docs/analysis/perspective-rules.md, docs/privacy/processors.md, apps/web/** (base-path module, placeholder server, tests, Dockerfile), worker/** (pyproject, stroke_rate metric, tests, Dockerfile), infra/compose/docker-compose.{dev,prod}.yml, .github/** (CI, release, templates, dependabot), scripts/github/** (backlog bootstrap), root tooling config
**Summary**: Base path is `/projects/rowlens` (changed from the kick-off prompt's `/projects/rowing` at Ewout's request mid-session). Read-only inspection of trustable-prod and the AudioScribe/trustable deploy setup; proposed architecture in 10 ADRs; scaffolded the monorepo with a tested base-path module and a first analysis metric so CI has real targets; created labels, milestones and the M0/M1 backlog (M2/M3 as epics) on GitHub. Nothing deployed; no server changes.
**Prompts used**: the RowLens kick-off prompt (Phase 0 section: "1. Read-only inspection of the server and the AudioScribe deployment … 5. Present a short summary: findings, decisions needing my input, risks, and the proposed first sprint.") pasted as the opening message of the session; mid-session: "contrary to the original prompt, do not use trustable.nl/projects/rowing but trustable.nl/projects/rowlens".
