# Phase 0 summary

**Date**: 2026-11-01 · **Status**: waiting for your approval. Nothing is deployed and nothing on the
server has changed.

Base path: **`https://trustable.nl/projects/rowlens`** (changed from `/projects/rowing` at your request).

## Findings (details: [server-inspection.md](server-inspection.md))

- `trustable.nl` → `trustable-prod`, a Hetzner CX32 (4 vCPU, 8 GB, **150 GB disk, 80 GB free**), Ubuntu 24.04,
  Docker 29 + Compose v5. Idle load, about 6.6 GB RAM free.
- One Compose project, `trustable`, runs Caddy, web, api, db and AudioScribe. The Caddyfile and compose
  file belong to the trustable.nl repo, and its CD overwrites them. AudioScribe is a profile-gated service in
  that file and is deployed by hand with `deploy.sh`. It uses OTP login, Resend SMTP and a path-scoped cookie,
  and Caddy strips its prefix.
- Database backups are encrypted and run daily, but they **sit on the same disk** as the database. No disk
  alerting.
- Old trustable images take up about 63 GB (117 old tags). They're not ours, but they are most of the used disk.
- Staging (CX22) is at **74 % disk**.

## Proposed architecture (ADRs in [docs/adr/](../adr/README.md))

| Area | Proposal |
|---|---|
| Hosting (0002) | Own Compose project `rowlens` in `/opt/rowlens`, internal network. Only `web` joins `trustable_proxy`. Resource limits, separate `DOCKER_CONFIG` |
| Base path (0003) | App mounted at `/projects/rowlens`, prefix **not** stripped, a single URL-builder module |
| Stack (0004) | TypeScript: React 19 + Vite SPA and Fastify API in one container, Drizzle + Postgres 16, Zod, i18next. Python 3.12 worker |
| Tenancy (0005) | Repository layer with `TenantContext` plus Postgres RLS, and cross-club tests that must pass |
| Storage (0006) | S3 interface. Pilot: MinIO on local disk, **30 GB hard cap**, disk alerts, no video backup. DB backups with restore tests |
| Video (0007) | tus upload. CFR H.264 renditions with about 0.25 s GOP at the source fps. `requestVideoFrameCallback` stepping. iPhone immersive mode |
| Queue (0008) | Postgres job table (`SKIP LOCKED` + `NOTIFY`), shared by Node and Python |
| Analysis (0009) | RTMPose / RTMDet (Apache-2.0) via ONNX, manual seat assignment, a rule table per perspective, value with evidence or refusal |
| LLM (0010) | OpenAI-compatible adapter. Pseudonymous metrics only, opt-in per club, versioned prompts |
| Auth (0011) | E-mail OTP without enumeration, hashed codes, `__Secure-` cookie with `Path=/projects/rowlens`, CSRF, rate limits |

## Decisions taken (2026-11-01)

| Topic | Decision | Recorded in |
|---|---|---|
| Video storage | **Local disk** (MinIO on the root disk), **hard cap 30 GB** of RowLens media; uploads pause at 85 % disk | ADR-0006, #32, #36 |
| Video backup | **None during the pilot**; stated plainly in the privacy statement; database backups continue | ADR-0006, #37, #64 |
| E-mail sender | **`RowLens <rowlens@trustable.nl>`** via the existing Resend account | ADR-0011, #30 |
| Origin | **Subpath `trustable.nl/projects/rowlens` now**; own host before a second club | ADR-0003, #16 |
| Error tracking | **Logs only for now**: error fingerprints in metrics and the daily health mail | ADR-0004, #35 |
| Branch protection | **None (private, free plan), by convention**: agents never push or merge to `main`; production deploys are a manual `workflow_dispatch` | ADR-0002, #18, #25 |
| LLM provider | **Deferred to M2** | ADR-0010 |

## Still open

1. **Approve or amend the remaining proposed ADRs** (especially 0002, 0004 and 0005).
2. **Reference stroke model** (M2): which coach validates it, and what's the source?
3. **Shared-component changes**, each shown in full before I apply it:
   - adding a RowLens-only CI deploy key to `deploy`'s `authorized_keys` (#23)
   - a Caddyfile route in the trustable.nl repo, diff in ADR-0003 (#24)
   - `web` joining the existing `trustable_proxy` network (ADR-0002)
4. **DB backup off-server destination** (Storage Box or a small bucket), in #37.
5. **Project board**: needs `gh auth refresh -s project` before I can create it.
6. **YOLO-pose is AGPL-3.0**. It stays excluded unless you accept the licence terms.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Video fills the shared disk (about 1 GB per 4K clip, 80 GB free) | trustable.nl + AudioScribe go down | 30 GB media cap (app + MinIO quota), alerts at 75 % disk, uploads pause at 85 % |
| No video backup during the pilot | a disk or server loss loses all videos | stated in the privacy statement; revisit before raising the cap or club 2 |
| No branch protection | an accidental push to main | agents never push to main; deploys are manual `workflow_dispatch` only |
| Same origin as two other apps | an XSS elsewhere could reach RowLens | CSP, CSRF, Origin checks; own host before club 2 |
| CPU contention while transcoding 4K | slow pages for the other apps | 2-vCPU limit, `nice`, queue |
| iPhone fullscreen hides custom controls | poor frame stepping on iPhone | CSS immersive mode; covered by the spike (#51) |
| VFR phone video breaks frame indices | annotations and metrics land on the wrong frame | CFR normalisation with PTS mapping (ADR-0007) |
| Pose accuracy in a crowded CX4+ boat | wrong metrics | manual seat assignment, refusal rules, eval suite |
| DB backups only on the server | data loss if the server is lost | off-site copy + weekly restore test (#37) |

## Proposed first sprint (2 weeks, M0)

1. #17 Phase 0 PR: review and merge
2. #19 Web app skeleton (Fastify + React under the base path)
3. #22 E2E harness behind Caddy, mobile + desktop
4. #31 Database: migrations, roles, tenant transaction helper
5. #34 i18n framework NL/EN
6. #23, #24, #25, #26 Provision, Caddy route, CD, hello-world live (each server step after your approval)
7. #32 `BlobStore` + MinIO on local disk with the 30 GB cap
8. #51 Player spike (can run in parallel: it only needs a static page and test clips)

OTP login (#28–#30) can start now that the sender is confirmed.
