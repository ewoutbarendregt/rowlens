# ADR-0004: Application stack

- **Status**: proposed
- **Date**: 2026-11-01

## Context

Existing conventions on the server: trustable.nl is React 19 + Vite + TypeScript SPA, Express (plain JS) +
Prisma + PostgreSQL 16, OTP auth, NL/EN, GHCR images, GitHub Actions. AudioScribe is Python/FastAPI with
ffmpeg. RowLens needs: a client-heavy video player (the core), an API with strict tenant isolation, a
resumable upload endpoint, and a Python CV/ML worker. All content is behind login, so SEO/SSR has no value.

## Decision

Monorepo (pnpm workspaces + a uv-managed Python project):

| Part | Choice | Why |
|---|---|---|
| Language (web) | **TypeScript strict** end-to-end | shared types for API contracts |
| Frontend | **React 19 + Vite SPA**, React Router, TanStack Query | matches trustable.nl; player is client-side anyway |
| API | **Fastify** (Node 22 LTS) in the same `web` container, serving the SPA + `/api` | one process, one port, simple base path |
| Validation | **Zod** schemas shared by client and server | one contract |
| DB | **PostgreSQL 16** | matches trustable; RLS for tenancy (ADR-0005) |
| ORM / SQL | **Drizzle ORM** + drizzle-kit migrations (SQL files in repo) | first-class raw SQL, RLS policies and `SET LOCAL` per transaction; Prisma (trustable) makes RLS awkward |
| i18n | **i18next / react-i18next**, ICU messages, `nl` + `en` JSON catalogs; server-side catalogs for e-mails; CI check for missing keys and hard-coded strings (eslint `i18next/no-literal-string`) | full i18n from day one |
| Uploads | **tus** (`@tus/server` + `@tus/s3-store`) client `tus-js-client` / Uppy | resumable from phone browsers |
| Worker | **Python 3.12**, uv, ffmpeg/ffprobe, OpenCV, ONNX Runtime | CV ecosystem |
| Queue | Postgres job table (ADR-0008) | no extra infra |
| Object storage | S3 API (ADR-0006) | portable |
| E-mail | Resend via SMTP (nodemailer), as AudioScribe | existing verified domain |
| Logging | pino (JSON) / structlog (JSON); request id propagated web → job → worker | structured logs |
| Errors | Sentry SDK pointed at an EU Sentry or self-hosted GlitchTip (**your choice**) | error tracking |
| Metrics | Prometheus text endpoint on the internal network only | uploads, processing time, failures |
| Tests | Vitest (unit/integration with Testcontainers Postgres), Playwright (mobile + desktop), pytest | |
| Lint/format | ESLint + Prettier; Ruff + mypy | |
| Feature flags | DB table `feature_flag(club_id nullable, key, enabled)` + env defaults | prototype on prod safely |

## Consequences

- One deployable for the web tier keeps the base path in one place.
- Drizzle deviates from trustable's Prisma; justified by RLS. Reviewers should reject raw queries that
  bypass the tenant-scoped transaction helper.
- If SSR is ever needed (public club pages, M3), Fastify can host it or we add a framework then.

## Alternatives considered

- **Next.js** with `basePath` — good base-path support, but server components/SSR add complexity we don't
  need behind a login; its standalone server is heavier. Viable second choice.
- **SvelteKit** — excellent `paths.base`, smaller bundles; rejected only for consistency with the React
  codebase you already maintain.
- **Express + Prisma (trustable clone)** — maximum consistency, weaker RLS story, no TypeScript backend.
