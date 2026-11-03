# TEST

Test strategy, prompts and results. This file is the source of truth for testing.

## Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit (web) | Vitest | base path, policies, validation, pure helpers |
| Unit (worker) | pytest | analysis math (stroke rate, phases, angles, sync), job handlers |
| Integration | Vitest + Testcontainers Postgres, media in a temp dir | API routes, permissions, **tenant isolation**, RLS coverage, tus |
| E2E | Playwright, viewports iPhone 15 / Pixel 8 / desktop, WebKit + Chromium | login, upload, playback controls, conversation |
| Analysis eval | pytest + reference clips | accuracy deltas on pipeline changes (M2) |
| Smoke | CI image build + `curl` health under base path | every PR |

Rules: every bug fix starts with a failing test; every new tenant table/route gets a cross-club test;
E2E runs with `BASE_PATH=/projects/rowlens` behind a Caddy container that mirrors prod.

## Coverage status

| Area | Tests | Status |
|---|---|---|
| `shared/base-path.ts` | 17 unit cases | ✅ passing |
| `server/config.ts` | 13 (defaults, normalisation, production URL/DB/SMTP, allowlist, OTP pepper, test-code isolation, invalid values) | ✅ passing |
| `server/db/tenant.ts` (`tenant.db.test.ts`, real Postgres 16) | 7: settings per transaction; nothing left on a reused pooled connection after commit and rollback (mutation-checked: session-wide `set_config` fails it); club A reads only A; can't insert into, update, delete or move rows to club B; club table shows only own club; malformed context rejected | ✅ passing |
| DB roles + schema (`schema.db.test.ts`) | 6: `rowlens_app` no superuser/BYPASSRLS/CREATEDB/CREATEROLE, owns nothing, can't CREATE or ALTER tables, can't read the migrations journal; re-migrate is a no-op; unsafe password refused; **every `club_id` table has RLS + a policy** | ✅ passing |
| Legacy pilot fallback (`pilot/{code,token,gate}.test.ts`, `rate-limit.test.ts`) | 21: retained while production can roll back; disabled when email auth is configured | ✅ passing |
| E-mail authentication (`auth/*.test.ts`, `auth/gate.db.test.ts`) | crypto purpose separation; NL/EN HTML + text; non-enumerating request; HMAC-only 10-minute codes; 5 attempts + single use; DB limits per mail/IP/verify; Secure/HttpOnly/Lax cookies; double-submit CSRF + cross-site refusal; tenant guard; current/all-other revocation; global tables denied to app role; pinned definer functions | ✅ passing |
| `/api/club` + `rowlens_club_id` (`api/club.db.test.ts`) | 5: same 404 as an unknown route without or with a forged cookie; pilot club through RLS; exact-slug lookup only, no club rows without context; pinned search_path | ✅ passing |
| E2E auth (`e2e/auth.spec.ts`, desktop + mobile) | request → wrong/correct code; session + CSRF cookie attributes; reload; sign-out; same response for known/unknown address; club API 404 without session | ✅ passing |
| Media store + sniffing (`media/{store,sniff}.test.ts`, `api/uploads.test.ts`) | 23: append/resume after a broken stream/limit without writing the crossing chunk, key validation (traversal), disk ratio; MP4/MOV/WebM magic bytes vs JPEG/PDF/zip/text; tus metadata parsing | ✅ passing |
| Sessions + tus upload (`api/uploads.db.test.ts`, real Postgres + temp media dir) | 11: sessions create/list/validate, list and detail expose `createdAt`; create → partial PATCH → HEAD → wrong offset 409 → rest → uploaded; finished upload takes no bytes; non-video rejected and deleted; refusals before bytes (size, type, metadata, tus version); chunk > 64 MB / past length / wrong type; disk ≥ 85 % pauses create and PATCH; global cap counts unfinished uploads; termination and delete remove bytes; **another club's session/video: 404 on every route, upload into it refused, nothing changed**; 404 without cookie | ✅ passing |
| Session creation time (`sessions/strings.test.ts`) | formats the database timestamp as local 24-hour time across winter and summer time | ✅ passing |
| Whole-session deletion (`api/sessions.db.test.ts`, real Postgres + temp media dir) | 2: deleting a session cascades to every video and annotation and removes every video media directory; another club's session stays a 404 and remains unchanged | ✅ passing |
| E2E upload (`e2e/upload.spec.ts`, local + behind Caddy) | create session and show its creation time on detail + list; choose a real clip + a fake .mov, camera per file, upload, fake rejected, list + status, delete one video; then delete the whole session through the inline confirmation and verify it leaves the list; club pages redirect to the gate without access | ✅ passing |
| Worker (`worker/tests`, pytest) | 44 (incl. size rule 576p → play-540 only, bitrate ceilings and fps scaling, low-bitrate sources not inflated, maxrate/bufsize in the command, probe bitrate): probe parsing (landscape/audio, iPhone HEVC portrait with display matrix and VFR, Android 90000/1 base rate, r far from average, 240 fps slow-mo, legacy rotate tag, 5 refusals); ffmpeg args (single decode split, CFR at the nominal rate, GOP = fps/4, keyint_min, no scene cuts, closed GOP, faststart, metadata stripped, no audio map without audio, renditions per source size); keys/traversal; backoff; stroke_rate | ✅ passing |
| Queue contract (`db/jobs.db.test.ts`) | 5: claim across clubs once, types and run_after respected, lease takeover then dead after the last attempt, claimed job visible only in its club, NOTIFY on insert; upload completion enqueues exactly one `video.process` job | ✅ passing |
| Edge E2E with the worker | upload → worker → "Ready" with `30 fps · 640×360 · 0:04`; renditions checked by hand: H.264 High, CFR 30, 120 frames, keyframe every 8 frames, no metadata; synthetic 4K60 HEVC portrait: upright 1080×1920 / 540×960, 180 frames, GPS stripped | ✅ passing |
| Media delivery (`api/videos.test.ts`, `api/videos.db.test.ts`) | 15 range cases (start-end, open, suffix, clamped, unsatisfiable, multi/garbage → whole); facts without keys; whole/206/suffix/416 with headers; poster JPEG; 404 for no cookie, not ready, missing rendition, unknown name, a rendition key outside the video's folder; another club's video and media 404 | ✅ passing |
| Edge E2E player on own video | upload → worker → Ready → player page: poster, 10 exact `.` steps on the H.264 rendition (Chrome), `currentTime` agrees; phone-sized Chrome: taps +1f ×12 and +0.1 s land on frame 15 = burned-in number, no horizontal overflow | ✅ passing |
| Notes API (`api/annotations.db.test.ts`, `api/visibility.db.test.ts`) | create (trimmed) → list in frame order → edit → delete; refusals (empty, > 2000, nameless pilot, negative/fractional frame, frame ≥ frame_count); signed-in author comes from the linked roster/account and a spoofed client name is ignored; 409 before processing; cascade on video delete; another club's video/notes 404 and unchanged | ✅ passing |
| Notes in video (`notes/overlay.test.ts`, `e2e/notes.spec.ts`, edge) | group/filter moments; 0.5/1/2 s hold; text chooses the corner away from drawing points; note at frame 10 appears in the picture; eye button + `N` and hold survive reload; away/back, edit and delete remove overlay + marker | ✅ passing |
| E2E player regression (`e2e/player.spec.ts`) | 20 quick presses without waiting land on frame 20 and back to 5 (BUG-004: fails 12/12 with the old `seeked` handler) | ✅ passing |
| Video page layout (manual, scripted Playwright) | WebKit iPhone 13 / 390×844: stage 358×201, note overlay 294×69, no horizontal overflow; iPhone immersive fullscreen 374×201 with the overlay inside it; low laptop 1000×540: stage 427×240, player and notes both visible. Earlier portrait/landscape checks remain. | ✅ checked |
| Drawing geometry (`drawing/geometry.test.ts`) | 6: right/straight/acute/zero angles; angles in picture pixels (a fraction "square" on 16:9 is 29.4°, not 45°); degenerate arm; fraction ↔ pixel mapping; points on the bars refused; arc direction | ✅ passing |
| Drawing API (`api/annotations.db.test.ts`) | line/arrow/angle stored with points; wrong count, out-of-range, unknown kind, note with points refused; drawings can't be edited, only deleted | ✅ passing |
| E2E drawing (`e2e/drawing.spec.ts`, edge) | signed-in account supplies the author; angle with horizontal/vertical arms reads 90°; arrow; both listed; Esc leaves the tool; held with the note then hidden; back via marker; delete one. Also checked in WebKit phone/fullscreen and low laptop. | ✅ passing |
| Readiness with DB (`readiness.db.test.ts`) | 3: 200 when Postgres answers; 503 within 5 s when unreachable; 503 on a wrong password | ✅ passing |
| `server/app.ts` | 13 (health/readiness, base-path scoping, redirect, SPA fallback, API 404 JSON, asset caching, build-info mismatch, CSP, request ids) | ✅ passing |
| E2E edge (`e2e/edge.spec.ts`, via `pnpm e2e:edge`) | 6 through the Caddy mirror: 308 redirect, prefix kept, CSP + site headers, 16 MB chunk passes, AudioScribe prefix still stripped, trustable.nl still gets other paths | ✅ passing |
| `infra/deploy/rowlens-deploy` unit (`test/run.sh`, stubbed docker, Ubuntu) | 77 checks (incl. the migrate check getting the tag on a first deploy, and a failing compose config stopping the deploy — BUG-009): input validation and forced-command injection, token handling, deploy/redeploy, rollback on unhealthy or failed `up`, first-deploy failure, pull failure, DB backup + retention, migrations, rollback/status, locking | ✅ passing |
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
| 2026-11-01 | claude/feat/60-drawing | `pnpm test`, local + edge E2E, drawing+notes ×5, local stack (iPhone WebKit, laptop) | 180 passed; 28 + 14 passed; 10 passed; checked |
| 2026-11-01 | claude/fix/laptop-portrait-layout | `pnpm test`, worker `pytest`, local + edge E2E, layout script (3 laptop sizes + iPhone) | 170 passed; 38 passed; 28 + 13 passed; layout checks passed |
| 2026-11-01 | claude/fix/ios-player-half | `pnpm test`, local + edge E2E, WebKit/Chrome layout script, store test ×15 | 170 passed; 28 + 13 passed; layout checks passed; 15/15 |
| 2026-11-01 | claude/feat/59-frame-notes | `pnpm test`, local + edge E2E, player spec ×3, notes spec ×10 | 170 passed; 28 + 13 passed; 42 passed; 10 passed |
| 2026-11-01 | claude/fix/47-rendition-size | worker `pytest`, edge E2E, size check in the worker image | 37 passed; 12 passed; 576p 0.78 Mbit/s → 1.7×, 4K60 40 Mbit/s → 0.14× |
| 2026-11-01 | claude/feat/49-player-own-videos | `pnpm test`, local + edge E2E | 164 passed; 26 + 12 passed |
| 2026-11-01 | claude/feat/47-worker-transcode | `pnpm test`, worker `pytest`, local + edge E2E, `rehearse.sh` | 145 passed; 33 passed; 26 + 12 passed; rehearsal passed |
| 2026-11-01 | claude/feat/45-upload | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge`, `rehearse.sh` | 140 passed (32 db); 26 passed; 12 passed; rehearsal passed |
| 2026-11-01 | claude/feat/84-access-code | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge` | 104 passed; 22 passed; 10 passed |
| 2026-11-01 | claude/feat/31-database (CI fix) | `pnpm --filter @rowlens/web e2e` (server with Testcontainers Postgres) | 18 passed, 12 edge-only skipped |
| 2026-11-01 | codex/feat/delete-session | `pnpm test`; format/lint/typecheck/build; `playwright test e2e/upload.spec.ts`; manual local UI at laptop + 390×844 | 191 passed; checks/build passed; 4 passed; deletion and creation timestamp checked |
| 2026-11-01 | codex/feat/28-30-email-auth | format/lint/typecheck; web + Postgres integration; worker checks; production build; local + edge desktop/mobile Playwright; deploy suite + rehearsal; local stack + browser | checks passed; 207 web + 44 worker + 30 local E2E + 15 edge E2E passed (8 edge-only skipped locally); deploy 77 + rehearsal passed; OTP login checked locally |
| 2026-11-02 | claude/feat/ui-classical | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; local E2E on iPhone 13 WebKit (scratch config adding the device); video sizes on the local stack (375×812, 1000×540, 1440×900, landscape + portrait) | 378 passed (incl. 30 contrast checks, month grouping, crew text); 38 passed; 21 passed (8 skipped); 19 passed (10 edge-only skipped); landscape 343×193 / 427×240 / 985×554 (≥ baseline), no horizontal scroll |
| 2026-11-02 | claude/feat/ui-language | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; iPhone 13 WebKit; switch checked in the browser (instant, saved, `<html lang>`) | 381 passed (new: language default/storage, mail language); 38 passed; 21 passed; 18 passed + 1 flake (BUG-012, 3/3 on rerun) |
| 2026-11-03 | claude/feat/video-page-layout | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; iPhone 13 WebKit; video sizes before/after on the local stack | 385 passed; 38 passed (BUG-013 twice before that); 21 passed; 18 + BUG-012 once (player spec alone 3 × 7); landscape 985×554 / 427×240 / 343×193, portrait 433×770 / 231×410 / 274×487, all equal to main; at 1000×540 the player column now fits the screen (512 px, was 587); no horizontal scroll |
| 2026-11-03 | claude/feat/85-stroke-marks | format/lint/typecheck; `pnpm test`; local E2E; edge E2E (new `strokes.spec`); layout on the local stack with marks | 404 passed (new: stroke maths, `mark_strokes`, stroke mark DB + roles); 38 passed; 22 passed (two earlier edge runs had timeouts in unrelated specs under load average 17, see DOCUMENTATION); 1000×540 player column 512 px with ticks, video 427×240; phone table fits 313 px, page 375 |
| 2026-11-03 | claude/feat/stroke-arrows-drive-middle | format/lint/typecheck; `pnpm test`; local E2E; edge E2E (`strokes.spec` extended: arrows per kind, calculated middles at 20/58/93 only when on); shapes checked on the local stack | 407 passed (new: drive middle, per-device switch); 38 passed; 22 passed; arrows, tick and circle render as intended |
| 2026-11-03 | claude/feat/angle-measures | format/lint/typecheck; `pnpm test`; local E2E; edge E2E (new `angles.spec`); by hand on the local stack (boat line, Ivo's knee 90°, label on the picture); layout 1000×540 and phone | 423 passed (new: angle maths and lean against the boat line, phases, tables, crew range; angle DB incl. merge; roles); 38 passed; 23 passed; tabs fit 305/343 px, video unchanged; BUG-015 noted |
| 2026-11-02 | codex/feat/106-notes-in-video | format/lint/typecheck/build; `pnpm test`; worker checks; local player E2E; edge E2E; WebKit phone/fullscreen + 1000×540 measurements | 385 web + 44 worker passed; 38 local E2E; 21 edge E2E (8 edge-only skipped locally); no overflow, overlay inside picture |

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
