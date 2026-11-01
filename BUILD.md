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
infra/compose/       dev compose (Postgres), edge stack, prod compose
docs/adr/            Architecture Decision Records
docs/analysis/       perspective validity rules
docs/privacy/        processors and data flows
scripts/github/      backlog/labels/milestones bootstrap
.github/             CI, release, templates, Dependabot
```

## Runtime architecture (proposed, ADR-0002…0008)

- `trustable-prod` (Hetzner CX32, 4 vCPU / 8 GB, 150 GB disk, 80 GB free), shared with trustable.nl and
  AudioScribe. Caddy (owned by trustable.nl) routes `/projects/rowlens/*` unchanged to `rowlens-web:3000`.
- Own Compose project `rowlens` in `/opt/rowlens`: `web`, `worker`, `db` (Postgres 16).
  Internal network for everything; only `web` joins `trustable_proxy`. CPU/memory limits on all services.
- Video bytes in `/opt/rowlens/media` behind `MediaStore` (keys, never paths; ADR-0006 amended: a
  directory, not MinIO), **hard-capped at 30 GB**; uploads pause at 85 % root-disk use. No video backup during the pilot (ADR-0006).
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
- Readiness checks are pluggable (`ReadinessCheck[]`); with `DATABASE_URL` set, `db` is one of them.

## Sessions and upload (#44 minimal, #45, #46, #50)

- Tables `rowing_session` and `video` (both `club_id` + RLS; a video's `(club_id, session_id)` must
  match a session of the same club). Status: uploading → uploaded → (processing → ready | failed);
  `rejected` = complete but not a video (bytes deleted).
- API (all behind the pilot guard, `private, no-store`): `GET/POST /api/sessions`,
  `GET /api/sessions/:id` (with videos), `DELETE /api/videos/:id` (row + every byte under its key).
- Upload: our own tus 1.0 server (core + creation + termination) at `/api/uploads`, not
  `@tus/server` (its v2 converts requests and loses the per-request club context). Creation checks
  `Upload-Length` ≤ 4 GB, type/extension, the session (RLS), 60 creations/h per IP, disk < 85 %, and
  reserves the size against the 30 GB cap under `pg_advisory_xact_lock` (via SECURITY DEFINER
  `rowlens_media_bytes()`, since RLS shows one club). PATCH: ≤ 64 MB per request, offset must match
  the file on disk (the file is the truth after a crash), one PATCH per upload at a time. On the last
  byte, magic bytes decide uploaded vs rejected; ffprobe follows in the worker (#47).
- Client: tus-js-client, 16 MB chunks, retries only what a new attempt can fix, resumes a file chosen
  again on the same device (fingerprint in localStorage), keeps the screen awake and warns before
  leaving while uploading. Camera position (boat/bank/drone) per file.
- Media: `MediaStore` (`server/media/store.ts`), keys `clubs/{club}/videos/{video}/original`;
  `MEDIA_DIR` (prod `/media` = `/opt/rowlens/media`; dev `apps/web/.media`).

## Worker: probe and transcode (#47, #33, ADR-0007/0008)

- Python 3.12 (`worker/`), psycopg 3, ffmpeg from Debian in the image; runs as uid 1000 with
  `MEDIA_DIR=/media` (same bind mount as web) and `DATABASE_URL` as `rowlens_app`.
- Loop (`python -m rowlens_worker`): `rowlens_claim_job` → handler → succeed / fail (backoff) / dead;
  LISTEN `rowlens_jobs` + 5 s poll; SIGTERM releases the running job. JSON log lines.
- `video.process`: ffprobe → metadata on `video` (fps_num/den, display size, duration, frame count,
  codec, rotation, vfr) → one ffmpeg run writing `renditions/play-1080` and `renditions/play-540` in a
  `work/` dir, then the poster from play-540 → rename into place → `status = ready`, `renditions`
  JSON, `renditions_bytes` (counted against the cap). Progress (0–95 %) and lease renewal every 5 s.
  A video deleted mid-way: its bytes are removed at the end.
- Limits on the shared server: container 2 CPUs / 2 GB, ffmpeg `nice -n 10` and 2 threads.
- UI: the session page shows "Processing n %", then `60 fps · 1920×1080 · 2:03`, or why it failed;
  it refreshes every 3 s while a video of the session is uploaded/processing.
- Tests: pytest for probe parsing (iPhone rotation/VFR, Android 90000/1, slow-mo, refusals), ffmpeg
  arguments (CFR, GOP, closed GOP, no metadata, renditions per size), keys, backoff; vitest for the
  queue contract; the edge E2E uploads a clip and waits for "Ready" from the real worker.

## Pilot access code (#84)

- Until login (#28), one shared code opens the pilot club. `PILOT_ACCESS_CODE_HASH` (scrypt, format
  `scrypt.15.8.1.<salt>.<hash>`: dots because Compose interpolates `$`) and `SESSION_SECRET` (hex) in
  `.env`; no hash → the gate is closed. `pnpm --filter @rowlens/web pilot:code` makes a code + hash.
- `POST /api/pilot/access` → cookie `rowlens_pilot=v1.<expiry>.<HMAC>`: HttpOnly, SameSite=Strict,
  `Path=/projects/rowlens/`, Secure on https, 30 days. The HMAC covers the hash's fingerprint, so a
  new code or secret signs everyone out. 5 attempts/min per IP, 30/min in total (in memory).
- `gate.guard` is the preHandler for club routes: no valid cookie → the same 404 as an unknown route;
  otherwise `req.tenant = {clubId: pilot, userId: null}` (club looked up via the SECURITY DEFINER
  function `rowlens_club_id(slug)`, migration 0001, which also seeds club `pilot`).
- CSRF: every POST/PUT/PATCH/DELETE must carry `Origin: PUBLIC_ORIGIN` (403 otherwise). Locally with
  Vite, `PUBLIC_ORIGIN=http://localhost:5173` (see `.env.example`).

## Database (ADR-0005, #31)

- Drizzle ORM 0.45 on `pg`. Schema in `apps/web/src/server/db/schema.ts`; `pnpm --filter @rowlens/web
  db:generate` writes a SQL migration to `src/server/db/migrations/` (reviewed like code; never `push`).
- Two roles. `rowlens_owner` (the Postgres image's superuser) owns the tables and runs migrations.
  `rowlens_app` is what the web app (and later the worker) connects as: login only, no BYPASSRLS, owns
  nothing, no CREATE; SELECT/INSERT/UPDATE/DELETE on tables via default privileges (a migration can
  REVOKE per table). The migrate command (`migrate.ts`) creates the role and (re)sets its password from
  `ROWLENS_APP_DB_PASSWORD` on every run, then applies migrations; the journal is in schema `drizzle`.
- `withTenant(db, {clubId, userId}, fn)` runs `fn` in a transaction with `app.club_id`/`app.user_id`
  set via `set_config(…, true)`, so they vanish at commit/rollback. Tenant tables use
  `tenantPolicy(…)`; outside `withTenant` the app sees no tenant rows at all.
- Prod: Compose service `migrate` (profile `migrate`, same image, `node dist/server/db/migrate-cli.js`)
  runs before `up` in `rowlens-deploy`. `web` gets `DATABASE_URL` for `rowlens_app`; `DATABASE_URL` is
  required in production. Migrations must be backward compatible with the previous release (expand,
  then contract), because a rollback keeps the migrated schema.
- E2E: Playwright's web server is `e2e/server.ts`, which starts a throwaway Postgres (Testcontainers),
  migrates it and then runs `dist/server/main.js`, so E2E needs Docker like the `db` tests.
- Local: `docker compose -f infra/compose/docker-compose.dev.yml up -d`, copy `apps/web/.env.example` to
  `apps/web/.env`, `pnpm db:migrate`, then `dev:server` picks up the database.
- Source maps are built `hidden` (not referenced from public bundles).
- Dev: `pnpm --filter @rowlens/web dev:server` (Fastify, :3000) + `dev:client` (Vite, proxies
  `/api` and `/health` to Fastify).

Server state, pending manual steps and rollback: [docs/runbooks/server-setup.md](docs/runbooks/server-setup.md).

## Player (ADR-0007, #51)

`apps/web/src/client/player/`: `frames.ts` (pure frame arithmetic, unit-tested at 24–240 fps and
1 ms / 1/15360 / 1/90000 timestamp precision), `usePlayer.ts` (state, `requestVideoFrameCallback`
frame tracking with a `currentTime` fallback, stepping that chains while a seek is in flight, loop by
pause → seek → play, fullscreen with an iPhone CSS fallback, start/step measurements), `Player.tsx`
(controls, keyboard, hold-to-repeat buttons), `strings.ts` (NL/EN until #34).

- Demo page `/demo/player` exists only when `PLAYER_DEMO` (`src/client/features.ts`) is true: always in
  `vite` dev, in builds only with `VITE_FEATURE_PLAYER_DEMO=true` (CI's E2E build). CI checks that a
  production build contains no demo code; `dropUnreachableChunks` in `vite.config.ts` removes chunks that
  Rolldown emits for eliminated dynamic imports.
- Demo clips: `pnpm demo:media [clip …]` (ffmpeg in Docker, `scripts/demo-media/`) writes to the
  gitignored `apps/web/public/demo-media/`; `.dockerignore` keeps local clips out of images.
- **Production currently runs with the demo on** (Ewout, 2026-11-01, to try it on phones):
  `images.yml` builds with `VITE_FEATURE_PLAYER_DEMO=true`, and the Dockerfile's `demo-media` stage
  generates the synthetic clips inside the image (~70 MB). It's public (no login yet) and contains no
  user data. To turn it off, drop that build arg; the bundle check in CI proves the off state.

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
`release.yml`: release-please (changelog + semver tags). · deploy-script (shellcheck, stubbed unit tests,
real-Docker rehearsal of `rowlens-deploy`).

## Delivery (ADR-0002, #25)

```
merge to main ──▶ images.yml: rowlens-web + rowlens-worker → ghcr.io/…:sha-<7>   (no deploy)
Ewout: Actions → deploy → Run workflow (tag) ──▶ deploy.yml
   ssh (CI key, forced command) "deploy <tag>"  + GITHUB_TOKEN on stdin
      └▶ /opt/rowlens/bin/rowlens-deploy: pull → pg_dump → migrate (if defined) → up
         → wait until web runs <tag> and /health/ready answers → keep, or roll back to previous
         → prune RowLens images except current + previous
   then: public check https://trustable.nl/projects/rowlens/health/live reports <tag>
```

- Server files: `/opt/rowlens/{docker-compose.yml,.env,bin/rowlens-deploy,state/,backups/,.docker/}`.
- `infra/deploy/install.sh` (approval) installs the script + compose file and restricts the CI key.
- Manual: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy status|rollback`.
- Exit codes: 0 ok · 2 failed (nothing to roll back / nothing changed) · 3 rolled back · 4 rollback failed.

## Known constraints

- Same origin as trustable.nl and AudioScribe — see ADR-0003 risk; plan an own host before club #2.
- Shared CPU: transcoding is limited to 2 vCPU at low priority.
- trustable.nl's site-wide `Permissions-Policy` blocks the microphone and camera for RowLens (in-browser
  voice notes need the own host); Caddy's 64 MB body limit is only a backstop (ADR-0003).
