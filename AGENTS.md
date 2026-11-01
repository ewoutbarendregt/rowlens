# AGENTS.md — RowLens

Instructions for coding agents (Codex and others). `CLAUDE.md` holds the same project rules in more
detail and stays the reference; this file adds how Ewout likes to work, learned while building
RowLens with Claude Code. **Start every session by reading `docs/HANDOFF.md`** (current state,
open PRs, next steps), then `PLAN.md`, `BUILD.md` and the newest entries of `DOCUMENTATION.md`.

RowLens: a multi-tenant web app where rowing clubs upload session video, step through it frame by
frame, and annotate it (notes, lines, arrows, angles). Served at
`https://trustable.nl/projects/rowlens` on the shared server `trustable-prod`.

## Hard rules (never break these)

- **Never modify, restart or reconfigure AudioScribe, trustable.nl or anything else on the
  server** that isn't RowLens. Shared components (Caddy, firewall, DNS, system packages, the
  `deploy` user's `authorized_keys`, anything under `/opt/trustable`) change only with Ewout's
  explicit approval **per change**, after showing the exact command or diff.
- **No destructive commands** (dropping databases, deleting volumes, `rm -rf`, force pushes,
  `docker system prune`) without explicit approval. Read-only inspection of the server is fine.
- **Never push, commit or merge to `main` on your own.** `main` is not technically protected.
  Everything goes through a PR; merge only when Ewout says so ("merge", "merge and deploy").
- **Deploy to production only when Ewout explicitly asks, each time.** One "deploy" doesn't make
  later work deployable. Default is: build and try it on the local stack. There is **no staging**.
- Changes on the server inside `/opt/rowlens` (`.env`, compose file via `infra/deploy/install.sh`,
  one-off database writes) are shown to Ewout first, with the exact command, and done after his yes.
- **Never commit secrets**, `.env` files, personal data or media. Server secrets live in
  `/opt/rowlens/.env`; CI secrets in GitHub Actions secrets.
- **No user video, names or e-mail addresses to external AI providers** (ADR-0010).
- All data access goes through `withTenant` + Postgres RLS (ADR-0005). Every new tenant table gets
  `club_id`, RLS + a policy (a schema test enforces this) and cross-club tests.
- No hard-coded user-facing strings: NL + EN for every string.
- When unsure, ask. A question beats a wrong assumption.

## How Ewout works

- He writes in Dutch or English; answer in the language he used. Code, comments and docs: English.
- He tries changes himself on the **local stack** (below) and gives feedback from screenshots.
  After a change, make sure it runs there and tell him exactly what to look at.
- He wants short, concrete summaries: what changed, what was checked (with numbers), what is not
  done or not verified, and where it is (PR links). Say plainly when something failed.
- UI matters: check layouts on a phone size (iPhone, in WebKit — Safari behaves differently from
  Chrome) and on laptop sizes, including a low window (~1000×540). Measure, don't assume (several
  layout bugs were a 0×0 video that only measuring caught).
- Browser popups (`window.confirm`) are not wanted; confirmations go in the page
  (`client/ui/ConfirmInline.tsx`).

## Git and PR conventions

- Branch per change. Ewout's global rule for Claude was the prefix `claude/`; use your own agent's
  prefix (e.g. `codex/<type>/<issue>-<slug>`) unless he says otherwise. Conventional Commits.
- One PR per issue/change; `Closes #N` only when every acceptance criterion is met, else `Refs #N`.
  If a commit message says "Closes" too early: don't force-push, push the fixed commit to a new
  branch and open the PR from there.
- **Stacked PRs**: base each on the one below. When merging: merge the bottom one **without
  deleting its branch** (deleting closes the PR stacked on it), then retarget the next PR to `main`
  (`gh pr edit N --base main`), check CI, merge, and so on.
- Security-sensitive changes (auth, sessions, permissions, tenancy, uploads, personal data) get a
  "Security review note" in the PR.
- Keep the project logs current: `DOCUMENTATION.md` (newest first, after each meaningful change),
  `BUGS.md` (every bug found), `TEST.md` (test runs and coverage), `BUILD.md` (how it works).

## Commands

```bash
# Local development: the whole app on the laptop (default place to try changes)
cp apps/web/.env.example apps/web/.env   # once; add a pilot code hash (pilot:code) + SESSION_SECRET
pnpm dev:up      # Postgres :5434 + worker (ffmpeg) in Docker, migrations
pnpm dev         # web with hot reload → http://localhost:5174/projects/rowlens/ (API :3100)
pnpm dev:down
# Ports 5173/5433 belong to Ewout's local trustable.nl stack: don't use them.

# Checks before a PR
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test     # test = unit + db (Docker)
(cd worker && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest)
VITE_FEATURE_PLAYER_DEMO=true pnpm build && pnpm --filter @rowlens/web e2e   # local E2E
pnpm build && pnpm edge:up && pnpm e2e:edge && pnpm edge:down   # behind Caddy, with the worker
docker run --rm -v "$PWD:/repo:ro" -w /repo ubuntu:24.04 bash infra/deploy/test/run.sh
infra/deploy/test/rehearse.sh                                     # deploy rehearsal, real Docker

# New migration (Drizzle): edit apps/web/src/server/db/schema.ts, then
pnpm --filter @rowlens/web db:generate   # review the SQL; drizzle-kit sometimes orders FKs wrong

# Server, read-only
ssh trustable-prod 'docker ps; df -h /'
```

Deploying (only on Ewout's request): GitHub → Actions → **deploy** → tag `sha-<7>` of the `images`
build of `main` (`gh workflow run deploy.yml -f tag=sha-xxxxxxx`). Then verify RowLens
(`/health/ready`), and that `https://trustable.nl/`, `https://api.trustable.nl/api/health` and
`https://trustable.nl/projects/audioscribe/` still answer 200. Log it in the runbook
`docs/runbooks/server-setup.md` and `DOCUMENTATION.md`.
