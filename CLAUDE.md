# CLAUDE.md — RowLens

Multi-tenant web platform where rowing clubs upload session video, step through it frame by frame,
discuss it between rowers and coaches, and get traceable, AI-supported technique analysis.
Served at `https://trustable.nl/projects/rowlens` on the shared `trustable-prod` server.

Read first, every session: `PLAN.md`, `BUILD.md`, latest entry of `DOCUMENTATION.md`, and the ADRs in
`docs/adr/` relevant to the task. Global rules in `~/.claude/CLAUDE.md` apply on top of this file.

## Hard rules

- **Never modify, restart or reconfigure AudioScribe, trustable.nl or any other service** on the server.
  Shared components (Caddy/reverse proxy, firewall, DNS, system packages, `deploy`'s `authorized_keys`,
  anything under `/opt/trustable`) change only with Ewout's explicit approval **per change**, after
  showing the exact diff/command.
- No destructive commands (drop DB, delete volumes, `rm -rf`, force push, `docker system prune`) without
  explicit approval. Read-only inspection of the server is fine.
- **`main` is not technically protected** (private repo, free plan): never push, commit or merge to
  `main`; everything goes through a PR that Ewout merges. Production deploys are a manual
  `workflow_dispatch` that only Ewout triggers.
- No deploy to production without approval.
- Never commit secrets, `.env` files, personal data or media. Server secrets live in `/opt/rowlens/.env`;
  CI secrets in GitHub Actions secrets.
- Never send user video, names or e-mail addresses to an external AI provider. LLM input is pseudonymous
  structured metrics only, behind the per-club `ai_explanations` flag, and the provider must be listed in
  `docs/privacy/processors.md` (ADR-0010).
- All data access goes through tenant-scoped repositories with a `TenantContext`; never bypass the
  permission layer or RLS (ADR-0005). Every new tenant table gets `club_id`, RLS and cross-club tests.
- No hard-coded user-facing strings: NL + EN catalogs for every string, including e-mails.
- Never concatenate URL paths by hand: use `apps/web/src/config/base-path.ts` (ADR-0003).
- When unsure, ask. A question beats a wrong assumption.

## Workflow

1. Explore → short plan (plan mode) → wait for approval on anything architectural, destructive or
   touching production infrastructure.
2. Tests first where practical; tests are the definition of done.
3. Run lint, typecheck and tests locally before opening a PR.
4. Branch `claude/<type>/<issue>-<slug>` (types: feat, fix, chore, docs, refactor, test, ci, perf).
   Conventional Commits. One PR per issue, `Closes #N`. **Never merge to `main`**; Ewout reviews and merges.
5. Security-sensitive changes (auth, sessions, permissions, tenancy, uploads, personal data, providers)
   get a "Security review note" in the PR.
6. Unfinished features ship behind a feature flag (we prototype on production).
7. Update `DOCUMENTATION.md` (newest first) after each meaningful change; log bugs in `BUGS.md`;
   test prompts/results in `TEST.md`; significant decisions as a new ADR.

## Commands

```bash
# Web (TypeScript, pnpm workspace; Node 22 — `corepack enable` once)
pnpm install
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @rowlens/web dev:server      # Fastify :3000; BASE_PATH defaults to /projects/rowlens
pnpm --filter @rowlens/web dev:client      # Vite dev server, proxies /api + /health to :3000
pnpm build && pnpm --filter @rowlens/web e2e   # Playwright smoke (once: playwright install chromium)
pnpm edge:up && pnpm e2e:edge && pnpm edge:down  # behind a Caddy mirroring trustable.nl, :8080

# Worker (Python 3.12, uv)
cd worker && uv sync
uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest

# Local infrastructure (Postgres :5433, MinIO :9000/:9001)
docker compose -f infra/compose/docker-compose.dev.yml up -d

# Server, read-only
ssh trustable-prod 'docker ps; df -h /'
```

## Architecture (see `docs/adr/`)

```
Caddy (trustable compose) ── /projects/rowlens/* (prefix kept) ──▶ rowlens-web :3000
                                                                   │  Fastify API + React SPA
                                                                   ▼
                       rowlens_internal network:  db (Postgres 16, RLS) ◀── worker (Python, ffmpeg, pose)
                                                  object storage (S3 API)    jobs via Postgres queue
```

- Own Compose project `rowlens` in `/opt/rowlens`; only `web` joins `trustable_proxy` (ADR-0002).
- Monorepo: `apps/web` (TS), `packages/*` (shared contracts), `worker/` (Python), `infra/`, `docs/`.
- Analysis: every metric is a value **with evidence** or a **refusal with reason**; perspective rules in
  `docs/analysis/perspective-rules.md` (ADR-0009).

## Conventions

- TypeScript strict, ESM, `.ts` import extensions; Zod at every boundary.
- Python 3.12, strict mypy, Ruff; pure functions for analysis math with unit tests.
- Frame indices refer to the CFR playback rendition (ADR-0007).
- Code, comments and docs in English; UI in NL + EN.
