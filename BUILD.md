# BUILD

Technical implementation and architecture. Decisions are recorded in [docs/adr/](docs/adr/README.md);
this file summarises the current state.

## Repository layout

```
apps/web/            TypeScript web tier, one container (ADR-0004)
  src/server/        Fastify: config (zod), health/readiness, CSP, static SPA + fallback
  src/client/        React 19 SPA (Vite), React Router with basename `${BASE_PATH}/`
  src/shared/        code for both, incl. base-path.ts — single owner of /projects/rowlens (ADR-0003)
  e2e/               Playwright smoke against the built server
packages/            shared TS packages (contracts, i18n) — added in M0/M1
worker/              Python 3.12 (uv): probing, transcoding, analysis
  src/rowlens_worker/metrics/   analysis math; value-with-evidence or refusal
infra/compose/       dev compose (Postgres + MinIO) and the DRAFT prod compose
docs/adr/            Architecture Decision Records
docs/analysis/       perspective validity rules
docs/privacy/        processors and data flows
scripts/github/      backlog/labels/milestones bootstrap
.github/             CI, release, templates, Dependabot
```

## Runtime architecture (proposed, ADR-0002…0008)

- `trustable-prod` (Hetzner CX32, 4 vCPU / 8 GB, 150 GB disk, 80 GB free), shared with trustable.nl and
  AudioScribe. Caddy (owned by trustable.nl) routes `/projects/rowlens/*` unchanged to `rowlens-web:3000`.
- Own Compose project `rowlens` in `/opt/rowlens`: `web`, `worker`, `db` (Postgres 16), optional `minio`.
  Internal network for everything; only `web` joins `trustable_proxy`. CPU/memory limits on all services.
- Video bytes behind a `BlobStore` interface (S3 API), served by MinIO on the local disk for the pilot,
  **hard-capped at 30 GB**; uploads pause at 85 % root-disk use. No video backup during the pilot (ADR-0006).
- Jobs: Postgres table with `SKIP LOCKED` + `LISTEN/NOTIFY`, consumed by the Python worker.
- Tenancy: app-layer policies + Postgres RLS; `club_id` on every tenant table; cross-club tests.
- Auth: e-mail OTP + invitations; `__Secure-rowlens_sid` cookie with `Path=/projects/rowlens`.
- Playback: H.264 MP4 renditions with ~0.25 s GOP at the source frame rate (CFR), `requestVideoFrameCallback`
  for frame-exact stepping.

## Web tier details

- **One process**: Fastify serves `${BASE_PATH}/health/{live,ready}`, `${BASE_PATH}/api/*` (JSON 404 for
  unknown routes) and the built SPA. Page navigations (GET/HEAD with `Accept: text/html`) to any other
  path under the base get `index.html` (`no-cache`); `assets/*` is fingerprinted and `immutable`.
- **Base path is fixed at build time** (Vite `base`); `dist/client/build-info.json` records it and the
  server refuses to start if its `BASE_PATH` differs. The image takes `--build-arg BASE_PATH`.
- `PUBLIC_ORIGIN` is required in production (absolute links); config is validated once at startup.
- Security headers via `@fastify/helmet`: strict CSP (no inline script/style, `frame-ancestors 'none'`);
  HSTS is left to Caddy. `X-Request-Id` is accepted if well-formed, otherwise generated, and echoed.
- Readiness checks are pluggable (`ReadinessCheck[]`); the DB check is added with #31.
- Source maps are built `hidden` (not referenced from public bundles).
- Dev: `pnpm --filter @rowlens/web dev:server` (Fastify, :3000) + `dev:client` (Vite, proxies
  `/api` and `/health` to Fastify).

Server state, pending manual steps and rollback: [docs/runbooks/server-setup.md](docs/runbooks/server-setup.md).

## Local edge stack (`infra/compose/docker-compose.edge.yml`)

`pnpm edge:up` builds rowlens-web and starts it behind Caddy at http://localhost:8080, using a copy of
trustable.nl's Caddyfile (`infra/caddy/edge.Caddyfile`) that imports our route (`infra/caddy/rowlens.caddy`,
the source of the #24 change). AudioScribe and the trustable.nl site are stand-ins that echo the path they
receive. `pnpm e2e:edge` runs the Playwright smoke + `e2e/edge.spec.ts` through it; `pnpm edge:down` stops
it. Networks mirror ADR-0002 (only rowlens-web is on the proxy network). No TLS locally.

## CI (`.github/workflows/ci.yml`)

policy (PR title + branch name) · web (format, lint, typecheck, test, build, Playwright smoke, audit) ·
edge (Playwright through the Caddy mirror) · worker (ruff,
mypy, pytest, pip-audit) · secrets (gitleaks) · images (build web + worker for linux/amd64, smoke test).
`release.yml`: release-please (changelog + semver tags). No deployment workflow yet; production deploys
will be a manual `workflow_dispatch` (no branch protection on the free private plan, ADR-0002).

## Known constraints

- Same origin as trustable.nl and AudioScribe — see ADR-0003 risk; plan an own host before club #2.
- Shared CPU: transcoding is limited to 2 vCPU at low priority.
- trustable.nl's site-wide `Permissions-Policy` blocks the microphone and camera for RowLens (in-browser
  voice notes need the own host); Caddy's 64 MB body limit is only a backstop (ADR-0003).
