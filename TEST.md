# TEST

Test strategy, prompts and results. This file is the source of truth for testing.

## Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit (web) | Vitest | base path, policies, validation, pure helpers |
| Unit (worker) | pytest | analysis math (stroke rate, phases, angles, sync), job handlers |
| Integration | Vitest + Testcontainers Postgres/MinIO | API routes, permissions, **tenant isolation**, RLS coverage, tus |
| E2E | Playwright, viewports iPhone 15 / Pixel 8 / desktop, WebKit + Chromium | login, upload, playback controls, conversation |
| Analysis eval | pytest + reference clips | accuracy deltas on pipeline changes (M2) |
| Smoke | CI image build + `curl` health under base path | every PR |

Rules: every bug fix starts with a failing test; every new tenant table/route gets a cross-club test;
E2E runs with `BASE_PATH=/projects/rowlens` behind a Caddy container that mirrors prod.

## Coverage status

| Area | Tests | Status |
|---|---|---|
| `shared/base-path.ts` | 17 unit cases | ✅ passing |
| `server/config.ts` | 8 (defaults, normalisation, production PUBLIC_ORIGIN, invalid values) | ✅ passing |
| `server/app.ts` | 13 (health/readiness, base-path scoping, redirect, SPA fallback, API 404 JSON, asset caching, build-info mismatch, CSP, request ids) | ✅ passing |
| E2E edge (`e2e/edge.spec.ts`, via `pnpm e2e:edge`) | 6 through the Caddy mirror: 308 redirect, prefix kept, CSP + site headers, 16 MB chunk passes, AudioScribe prefix still stripped, trustable.nl still gets other paths | ✅ passing |
| E2E smoke (`e2e/smoke.spec.ts`) | 3 × desktop + mobile Chromium (home + API under base, deep link shell, nothing outside base) | ✅ passing |
| `stroke_rate` | 8 (even rhythm, NTSC fps, refusals, invalid input) | ✅ passing |

## Runs

| Date | Branch | Command | Result |
|---|---|---|---|
| 2026-11-01 | claude/chore/17-phase-0-foundation | `pnpm test`, `uv run pytest` | 19 + 8 passed |
| 2026-11-01 | claude/feat/19-web-app-skeleton | `pnpm test`, `pnpm --filter @rowlens/web e2e` | 38 passed; 6 passed |
| 2026-11-01 | claude/test/22-local-edge-stack | `pnpm edge:up && pnpm e2e:edge` | 8 passed, 1 skipped |

## Playwright prompts

### Edge stack (#22, partial)

Prompt used: "Add a local Caddy stack that mirrors the prod route" — check, through Caddy, that the
proposed RowLens route redirects the bare path, keeps the prefix, keeps our CSP next to the site-wide
headers, passes a tus-sized chunk, and leaves AudioScribe's prefix stripping and the trustable.nl default
route unchanged.

Findings: Caddy's `max_size` didn't return 413 for a 65 MB POST that the app answered without reading
(backstop only, see ADR-0003); trustable.nl's `Permissions-Policy` blocks the microphone for RowLens.

### Web skeleton smoke (#19)

Prompt used: "Playwright test that proves the SPA works under /projects/rowlens: home renders and fetches
/health/live through the base path, every same-origin request stays under the base path, a deep link
gets the app shell and client-side navigation back home lands on the canonical trailing-slash URL, and
nothing is served outside the base path."

Finding while writing it: React Router with basename `/projects/rowlens` turned `<Link to="/">` into the
non-canonical `/projects/rowlens`; fixed by giving the router basename `/projects/rowlens/`.
