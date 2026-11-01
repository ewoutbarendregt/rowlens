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
| `base-path.ts` | 17 unit cases | ✅ passing |
| placeholder server | 2 (health under base path, 404 outside) | ✅ passing |
| `stroke_rate` | 8 (even rhythm, NTSC fps, refusals, invalid input) | ✅ passing |

## Runs

| Date | Branch | Command | Result |
|---|---|---|---|
| 2026-11-01 | claude/chore/17-phase-0-foundation | `pnpm test`, `uv run pytest` | 19 + 8 passed |

## Playwright prompts

_None yet — added with the first E2E story (M0 login)._
