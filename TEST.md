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
| `server/config.ts` | 9 (defaults, normalisation, production PUBLIC_ORIGIN + DATABASE_URL, invalid values) | ✅ passing |
| `server/db/tenant.ts` (`tenant.db.test.ts`, real Postgres 16) | 7: settings per transaction; nothing left on a reused pooled connection after commit and rollback (mutation-checked: session-wide `set_config` fails it); club A reads only A; can't insert into, update, delete or move rows to club B; club table shows only own club; malformed context rejected | ✅ passing |
| DB roles + schema (`schema.db.test.ts`) | 6: `rowlens_app` no superuser/BYPASSRLS/CREATEDB/CREATEROLE, owns nothing, can't CREATE or ALTER tables, can't read the migrations journal; re-migrate is a no-op; unsafe password refused; **every `club_id` table has RLS + a policy** | ✅ passing |
| Pilot gate (`pilot/{code,token,gate}.test.ts`, `rate-limit.test.ts`) | 21: code generation/normalisation/salting, malformed hashes; token expiry, tampering, void after new code/secret; cookie attributes; wrong/malformed code; 5/min per IP and 30/min overall (via X-Forwarded-For); logout; closed gate; Origin check | ✅ passing |
| `/api/club` + `rowlens_club_id` (`api/club.db.test.ts`) | 5: same 404 as an unknown route without or with a forged cookie; pilot club through RLS; exact-slug lookup only, no club rows without context; pinned search_path | ✅ passing |
| E2E gate (`e2e/pilot.spec.ts`, local + behind Caddy) | wrong code → alert; code typed in capitals with spaces → club; cookie HttpOnly/Strict/path; survives reload; sign-out; club API 404 without access | ✅ passing |
| Readiness with DB (`readiness.db.test.ts`) | 3: 200 when Postgres answers; 503 within 5 s when unreachable; 503 on a wrong password | ✅ passing |
| `server/app.ts` | 13 (health/readiness, base-path scoping, redirect, SPA fallback, API 404 JSON, asset caching, build-info mismatch, CSP, request ids) | ✅ passing |
| E2E edge (`e2e/edge.spec.ts`, via `pnpm e2e:edge`) | 6 through the Caddy mirror: 308 redirect, prefix kept, CSP + site headers, 16 MB chunk passes, AudioScribe prefix still stripped, trustable.nl still gets other paths | ✅ passing |
| `infra/deploy/rowlens-deploy` unit (`test/run.sh`, stubbed docker, Ubuntu) | 71 checks: input validation and forced-command injection, token handling, deploy/redeploy, rollback on unhealthy or failed `up`, first-deploy failure, pull failure, DB backup + retention, migrations, rollback/status, locking | ✅ passing |
| `rowlens-deploy` rehearsal (`test/rehearse.sh`, real Docker) | first deploy, second deploy with real `pg_dump`, real migrations (journal written, `rowlens_app` without BYPASSRLS), broken release auto-rollback (exit 3), manual rollback, status | ✅ passing |
| `client/player/frames.ts` | 24: round-trips for every frame at 24–240 fps and 59.94, presentation timestamps at 1 ms / 1/15360 / 1/90000 precision, clamping, ±seconds, time format, loop range and jump | ✅ passing |
| E2E player (`e2e/player.spec.ts`, VP9 fixture, desktop + mobile Chromium) | 6: ±1 frame over 20 frames and back across keyframes (readout and `currentTime` agree), buttons ±1f/±0.1s/±1s and bounds, speed buttons, loop at 0.25×/0.5×/1× stays ≤ 1 frame past its end | ✅ passing |
| E2E smoke (`e2e/smoke.spec.ts`) | 3 × desktop + mobile Chromium (home + API under base, deep link shell, nothing outside base) | ✅ passing |
| `stroke_rate` | 8 (even rhythm, NTSC fps, refusals, invalid input) | ✅ passing |

## Runs

| Date | Branch | Command | Result |
|---|---|---|---|
| 2026-11-01 | claude/chore/17-phase-0-foundation | `pnpm test`, `uv run pytest` | 19 + 8 passed |
| 2026-11-01 | claude/feat/19-web-app-skeleton | `pnpm test`, `pnpm --filter @rowlens/web e2e` | 38 passed; 6 passed |
| 2026-11-01 | claude/test/22-local-edge-stack | `pnpm edge:up && pnpm e2e:edge` | 8 passed, 1 skipped |
| 2026-11-01 | claude/feat/25-manual-deploy | `infra/deploy/test/run.sh` (Ubuntu), `rehearse.sh` | 71 passed; rehearsal passed |
| 2026-11-01 | claude/feat/51-player-demo | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge` | 62 passed; 18 passed; 8 passed |
| 2026-11-01 | claude/feat/31-database | `pnpm test`, `pnpm e2e:edge`, `run.sh`, `rehearse.sh` | 79 passed (16 db); 8 passed; 71 passed; rehearsal passed |
| 2026-11-01 | claude/feat/84-access-code | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge` | 104 passed; 22 passed; 10 passed |
| 2026-11-01 | claude/feat/31-database (CI fix) | `pnpm --filter @rowlens/web e2e` (server with Testcontainers Postgres) | 18 passed, 12 edge-only skipped |

## Playwright prompts

### Player spike (#51)

Prompt used: "Player demo first" — a dev-only demo with clips whose frames show their own number;
verify stepping, ±0.1 s/±1 s, speeds and loop in the browser, then in Playwright.

Found while testing (all fixed, see ADR-0007 "Spike results"): loop overshoot of ~60 frames at 1×
(seek while playing + re-seeking every frame); frames floored from millisecond-rounded WebM timestamps
landing one frame early; a stale step target after such a mis-mapped frame; the demo chunk shipping in
production builds (object-property flag, bracket env access, Rolldown emitting eliminated chunks).
Measurement caveat: the in-app browser pane, when hidden, doesn't paint, so rVFC stops; time only on a
visible page or headless Playwright. Real Chrome (H.264) results are in ADR-0007; phones still to do.

### Deploy script (#25)

Mutation check: with the `|| return 1` after `compose up` and the image-tag check in `wait_ready`
removed, the "failed 'up' is not mistaken for success" test fails (2 checks). Found by writing the tests:
`start_tag` runs inside `if`, where bash ignores `set -e`, so a failed `up` with the old container still
healthy was recorded as a successful deploy. The rehearsal then hit that exact situation for real (missing
image) and rolled back correctly. Also found: the script file lacked its executable bit in git.

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
