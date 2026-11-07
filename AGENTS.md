# AGENTS.md — RowLens

The single source of instructions for every coding agent on this repository: opencode, Codex,
Claude Code (whose `CLAUDE.md` imports this file) and others. It is self-contained on purpose:
opencode loads this file and then **skips `CLAUDE.md`**, so nothing here may depend on it.

RowLens is a multi-tenant web platform where rowing clubs upload session video, step through it
frame by frame, discuss it between rowers and coaches, and get traceable, AI-supported technique
analysis. Served at `https://trustable.nl/projects/rowlens` on the shared server `trustable-prod`.
The product owner is **Ewout**; the head coach of the pilot club gives the rowing input.

## Start of every session

1. Read `docs/HANDOFF.md` (current state: production version, open PRs, what's in progress, next
   steps). opencode loads it automatically through `opencode.json`.
2. Read `PLAN.md`, `BUILD.md` (how it works) and the newest entries of `DOCUMENTATION.md`.
3. Read the ADRs in `docs/adr/` that touch the task.

"Continue where we left off" means: the newest `DOCUMENTATION.md` entry, then `docs/HANDOFF.md`,
`PLAN.md` and `BUILD.md`.

## Hard rules (never break these)

- **Never modify, restart or reconfigure AudioScribe, trustable.nl or anything else on the server**
  that isn't RowLens. Shared components (Caddy/reverse proxy, firewall, DNS, system packages, the
  `deploy` user's `authorized_keys`, anything under `/opt/trustable`) change only with Ewout's
  explicit approval **per change**, after showing the exact command or diff.
- **No destructive commands** (dropping databases, deleting volumes, `rm -rf`, force pushes,
  `docker system prune`) without explicit approval. Read-only inspection of the server is fine.
- **Never push, commit or merge to `main` on your own.** `main` is not technically protected (private
  repo, free plan). Everything goes through a PR; merge only when Ewout says so ("merge", "merge
  and deploy").
- **Deploy to production only when Ewout explicitly asks, each time.** One "deploy" doesn't make
  later work deployable. The default is: build it and try it on the local stack.
- **There is no staging, and none is planned.** Environments: local development and production.
- Before merging or pushing anything that triggers **another repository's** pipeline (e.g.
  trustable.nl: `develop` auto-deploys its staging, `main` its production), list every deploy it
  triggers and get a yes for that side effect.
- Changes on the server inside `/opt/rowlens` (`.env`, the compose file via
  `infra/deploy/install.sh`, one-off database writes) are shown to Ewout first, with the exact
  command, and done after his yes.
- **Never commit secrets**, `.env` files, personal data or media. Server secrets live in
  `/opt/rowlens/.env`; CI secrets in GitHub Actions secrets. When a secret or e-mail address is
  needed, Ewout types it into a **terminal prompt** (`read -s`), never into chat or onto a command
  line. His admin address lives only in the local `apps/web/.env` and the server's
  `AUTH_ADMIN_EMAILS`, never in the repository.
- **Never send user video, names or e-mail addresses to an external AI provider** (ADR-0010). LLM
  input is pseudonymous structured metrics only, behind the per-club `ai_explanations` flag, and
  the provider must be listed in `docs/privacy/processors.md`. Picture analysis runs in our own
  worker (ADR-0018: OpenCV, no model).
- **All data access goes through tenant-scoped repositories with a `TenantContext`**
  (`withTenant`, Postgres RLS, ADR-0005); never bypass the permission layer or RLS. Every new
  tenant table gets `club_id`, RLS, a tenant policy, restrictive role policies where rowers are
  limited (ADR-0013), and cross-club tests (a schema test enforces RLS + policy).
- **No hard-coded user-facing strings**: NL and EN catalogs for every string, including e-mails.
- **Never concatenate URL paths by hand**: use `apps/web/src/shared/base-path.ts` (ADR-0003).
- When unsure, ask. A question beats a wrong assumption.

## How Ewout works

- He writes in Dutch or English: answer in the language he used. Code, comments and docs: English.
- He tries changes himself on the **local stack** and gives feedback from screenshots. After a
  change, make sure it runs there and tell him exactly what to look at. Don't offer "deploy" as
  the default next step; he asks for it ("merge and deploy").
- He wants short, concrete reports: what changed, what was checked (with numbers), what is not done
  or not verified, and where it is (PR links). Say plainly when something failed.
- He often works remotely from his phone: put the question he must answer at the end of the
  message, with the choices spelled out.
- UI matters: check phone size in **WebKit** (iPhone; Safari behaves differently from Chrome) and
  laptop sizes, including a low window (~1000×540). Measure, don't assume.
- No browser popups (`window.confirm`): confirmations go in the page (`client/ui/ConfirmInline.tsx`).
- Coaches use it with their fingers on an iPhone: taps must be forgiving (see the drawing layer).

## Workflow

1. Explore → short plan → **wait for approval** on anything architectural (new tables, migrations,
   new dependencies, new perspectives of analysis), destructive or touching production.
2. Tests first where practical; tests are the definition of done.
3. Run the checks below before opening a PR.
4. Branch per change: **`opencode/<type>/<issue>-<slug>`** when you are opencode (Claude Code
   uses `claude/`, Codex `codex/`), types `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`,
   `perf`. Conventional Commits. This overrides any global agent rule about branch prefixes.
5. One PR per issue or change; `Closes #N` only when every acceptance criterion is met, else
   `Refs #N`. Never force-push; if a commit message said "Closes" too early, push the fixed commit
   to a new branch and open the PR from there.
6. Security-sensitive changes (auth, sessions, permissions, tenancy, uploads, personal data,
   providers) get a **"Security review note"** in the PR.
7. Unfinished features ship behind a feature flag (`apps/web/src/client/features.ts`, build-time
   `VITE_FEATURE_*`); we prototype on production.
8. After pushing a PR, CI must be green before merging. If every job fails without a failed step,
   it's GitHub billing (the run says "recent account payments have failed"): tell Ewout, it isn't
   the code.

### Stacked PRs

Base each on the one below. Merge the bottom one **without deleting its branch** (deleting closes
the PR stacked on it), retarget the next one (`gh pr edit N --base main`), wait for CI, merge, and
so on. A squash-merge that conflicts: merge `main` into the branch, then take the branch's own tree
(`git checkout <sha> -- .`).

## Project logs (keep them current while you work)

Six files at the root: `PLAN.md` (goals), `BUILD.md` (how it works, architecture decisions in
practice), `FEATURES.md` (status per feature), `TEST.md` (strategy, coverage, every test run),
`BUGS.md` (every bug found), `DOCUMENTATION.md` (agent work log, newest first). A significant
decision gets a new ADR (`docs/adr/`, copy `0000-template.md`, add it to the index).

`DOCUMENTATION.md` entry, at the top, after each meaningful change:

```
## [YYYY-MM-DD] — [short description]

**Session**: [branch name]
**Changed**: [comma-separated file list]
**Summary**: [1-2 sentences — what changed and why]
**Prompts used**: [Ewout's request verbatim, so it can be replayed]
```

A deployment is logged in the next PR's `DOCUMENTATION.md` entry (tag, deploy run id, what was
verified) and in `docs/runbooks/server-setup.md`. At the end of a session, update
`docs/HANDOFF.md` so the next agent (any tool) can pick up.

`BUGS.md` entry:

```
### [BUG-NNN] [Title] — [severity: low / medium / high / critical]
**Location**: [file:line]
**Status**: open | in-progress | fixed
**Found**: [YYYY-MM-DD]
**Description**: [what happens vs. what should happen]
**Fix**: [description or PR link when resolved]
```

## Commands

```bash
# Once: Node 22 (`corepack enable`), pnpm install; Python 3.12 via uv (cd worker && uv sync)
cp apps/web/.env.example apps/web/.env   # local settings; Ewout adds SESSION_SECRET etc. himself

# Local stack: the default place to try changes
pnpm dev:up      # Postgres :5434 + worker (ffmpeg, OpenCV) in Docker, migrations; rebuilds the worker
pnpm dev         # web with hot reload → http://localhost:5174/projects/rowlens/ (API :3100)
pnpm dev:down    # stops Postgres and worker (data stays in the Docker volume)
# Ports 5173/5433 belong to Ewout's local trustable.nl stack: don't use them.
# Signing in locally: the API logs the six-digit code ("development OTP code") for an allowed
# address (AUTH_ALLOWED_EMAILS in apps/web/.env, e.g. rowlens@localhost.test). Pipe `pnpm dev`
# through `tee` to a file and read the code from it.

# Checks before a PR
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test     # test = unit + db (Docker)
pnpm --filter @rowlens/web exec vitest run --project unit           # unit only, without Docker
(cd worker && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest)
pnpm demo:media --e2e                       # E2E clips (ffmpeg in Docker), once
VITE_FEATURE_PLAYER_DEMO=true pnpm build && pnpm --filter @rowlens/web e2e   # local E2E
pnpm edge:up && pnpm e2e:edge && pnpm edge:down   # behind a Caddy mirroring trustable.nl (:8080),
                                                  # with the real worker; desktop Chromium
docker run --rm -v "$PWD:/repo:ro" -w /repo ubuntu:24.04 bash infra/deploy/test/run.sh
infra/deploy/test/rehearse.sh                     # deploy rehearsal against local Docker

# New migration (Drizzle): edit apps/web/src/server/db/schema.ts, then
pnpm --filter @rowlens/web db:generate --name <slug>   # review the SQL; hand-write what Drizzle
pnpm --filter @rowlens/web db:migrate                  # can't (renamed keys, enum values, backfills)

# Server, read-only
ssh trustable-prod 'docker ps; df -h /'
```

Testing notes:

- iPhone WebKit: a scratch Playwright config that spreads the repo's config and sets
  `projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 13'] } }]` (for the edge stack also
  `webServer: []` and `baseURL: 'http://localhost:8080/projects/rowlens/'`). Known WebKit-only flakes:
  BUG-012, BUG-017.
- The local edge database is kept between runs: it accumulates test data, and its hourly upload
  limit can run out after many runs (restart `rowlens-edge-rowlens-web-1` to reset it).
- `gh run watch` sometimes returns before the run ends: check with `gh run view <id>`.
- psql over ssh: send the SQL on stdin (`ssh trustable-prod 'docker exec -i rowlens-db-1 sh -c
  "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tA"' <<'EOF' … EOF`), quoting inside `-c` breaks.

## Deploying (only on Ewout's request, each time)

1. Merge the PR (`gh pr merge N --squash --delete-branch`) once its CI is green.
2. Wait for the `images` and `ci` runs of the merge commit on `main` to succeed.
3. `gh workflow run deploy.yml -f tag=sha-<7> -f check_public_url=true` and wait for it.
4. Verify, read-only: `https://trustable.nl/projects/rowlens/health/ready` reports the new version
   with `db` ok; `ssh trustable-prod 'docker ps'` shows `rowlens-web` and `rowlens-worker` on the
   new tag and the trustable/AudioScribe containers untouched; `https://trustable.nl/`,
   `https://api.trustable.nl/api/health` and `https://trustable.nl/projects/audioscribe/` answer
   200. New migrations: check the count and any backfill jobs.
5. Log it (see Project logs). Roll back: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy
   rollback` (only with Ewout's yes). The `release` workflow fails on every merge (Actions may not
   open PRs); that is known and harmless.

## Architecture (details in `docs/adr/` and `BUILD.md`)

```
Caddy (trustable compose) ── /projects/rowlens/* (prefix kept) ──▶ rowlens-web :3000
                                                                   │  Fastify API + React SPA
                                                                   ▼
                       rowlens_internal network:  db (Postgres 16, RLS) ◀── worker (Python, ffmpeg, OpenCV)
                                                  media on local disk        jobs via Postgres queue
```

- Own Compose project `rowlens` in `/opt/rowlens`; only `web` joins `trustable_proxy` (ADR-0002).
- Monorepo: `apps/web` (TypeScript: Fastify 5, React 19, Vite, Drizzle; `src/shared` holds code
  shared by server and client), `worker/` (Python 3.12, uv), `infra/`, `docs/`, `scripts/`.
- Roles: rower, coach, club admin (`admin`), plus separate global RowLens admin (ADR-0021,
  feature-enabled account/club flow). `can()` in `apps/web/src/server/auth/can.ts` plus
  restrictive RLS role policies underneath.
- Analysis: every metric is a value **with evidence** or a **refusal with a reason** (ADR-0009);
  perspective rules in `docs/analysis/perspective-rules.md`. Stroke marks (ADR-0016), angles per
  phase (ADR-0017), the boat line per frame (ADR-0018).
- Frame indices refer to the CFR playback rendition (ADR-0007).

## Conventions

- TypeScript strict, ESM, `.ts` import extensions; Zod at every boundary.
- Python 3.12, strict mypy, Ruff; pure functions for analysis math, with unit tests.
- Design: the Classical design system (ADR-0014); tokens in `apps/web/src/client/styles.css`.
- Code, comments and docs in English; UI in NL (default) and EN (ADR-0015).
- Commit trailer and PR footer: name the agent that wrote it (e.g. `Co-Authored-By: <agent>`).
