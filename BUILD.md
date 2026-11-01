# BUILD

Technical implementation and architecture. Decisions are recorded in [docs/adr/](docs/adr/README.md);
this file summarises the current state.

## Repository layout

```
apps/web/            TypeScript: Fastify API + React SPA (currently a placeholder HTTP server)
  src/config/base-path.ts   single owner of /projects/rowlens handling (ADR-0003)
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

## CI (`.github/workflows/ci.yml`)

policy (PR title + branch name) · web (format, lint, typecheck, test, build, audit) · worker (ruff,
mypy, pytest, pip-audit) · secrets (gitleaks) · images (build web + worker for linux/amd64, smoke test).
`release.yml`: release-please (changelog + semver tags). No deployment workflow yet; production deploys
will be a manual `workflow_dispatch` (no branch protection on the free private plan, ADR-0002).

## Known constraints

- Same origin as trustable.nl and AudioScribe — see ADR-0003 risk; plan an own host before club #2.
- Shared CPU: transcoding is limited to 2 vCPU at low priority.
