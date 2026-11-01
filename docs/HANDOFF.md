# Handoff to Claude — state of RowLens on 2026-11-01 (late evening)

Updated after Ewout asked Codex to hand the work back to Claude. Read `AGENTS.md` first for the rules.
Continue from branch **`codex/feat/28-30-email-auth`**; it is pushed, clean, and contains the two new
green PRs plus the latest handoff. Details are in `DOCUMENTATION.md` (newest first), `BUILD.md`,
`BUGS.md`, `TEST.md`, the ADRs in `docs/adr/` and `docs/runbooks/server-setup.md`.

## What exists

| Area | State |
|---|---|
| Hosting | Own Compose project `rowlens` in `/opt/rowlens` on trustable-prod; Caddy route `/projects/rowlens/*`; manual deploy workflow with backup, migrations, readiness check and automatic rollback |
| Access | E-mail OTP (#28–#30) for an operator-managed one-club allowlist; revocable 30-day sessions, DB rate limits and CSRF |
| Data | Postgres 16, Drizzle migrations 0000–0006, role `rowlens_app` without BYPASSRLS, `withTenant` + RLS on every tenant table |
| Upload | Sessions; resumable tus upload (own server) into `/opt/rowlens/media`; 4 GB per file, 30 GB total cap, 85 % disk pause |
| Processing | Python worker: ffprobe, CFR H.264 renditions play-1080/play-540 (GOP ≈ 0.25 s, metadata stripped), poster, Postgres job queue |
| Player | Frame-accurate stepping, 0.25/0.5/1×, loop, full screen; portrait/landscape layouts on phone and laptop |
| Analysis (manual) | Notes, lines, arrows and angles at a frame; one section per frame; delete per item or per frame |

## Production

- Runs **`sha-c15cb47`** (deployed 2026-11-01 19:34 UTC): everything up to iPhone/laptop layout
  (#94) and notes (#93). **Not yet on production**: everything in the open PRs below.
- Previous release `sha-4e03e66` is kept for rollback (`rowlens-deploy rollback`).
- Read-only preflight after the Codex work: DB/web healthy, worker running, disk 48 % used; RowLens,
  trustable.nl, api.trustable.nl and AudioScribe all returned 200. The production compose is current;
  the deploy script still needs the approved #98 reinstall.
- Production still uses the old pilot access code until the authentication PR is merged, configured
  and deployed. The old code file can be archived after the new login is verified.
- Uploaded so far: a few test videos from Ewout's iPhone. One was processed at 31.58 fps (BUG-007,
  ~5 % duplicate frames); two older uploads were never processed (made before the worker existed).
  Re-uploading after the next deploy fixes both.

## Open PRs, in merge order (all CI green unless noted; none merged, nothing deployed)

1. **#98** `fix(deploy)`: a first deploy could silently skip migrations (BUG-009). Base `main`.
   Changes `infra/deploy/rowlens-deploy` → the server copy must be reinstalled at the next deploy.
2. **#95** `fix`: laptop layout for portrait video; worker picks 30 fps for phone clips on a 600 Hz
   timestamp grid (BUG-007, BUG-008). Base `main`.
3. **#96** `chore(dev)`: the local development stack. Stacked on #95.
4. **#97** `feat(drawing)`: lines/arrows/angles (#60), one section per frame with an always-open
   explanation, click a section to jump and select it, delete a whole note, in-page confirmations,
   video display name `[session]-[#]-[start]-[length]` (migration 0005), and #98 merged in.
   Stacked on #96.
5. **#99** original handoff to Codex (`AGENTS.md`, this file). Stacked on #97.
6. **#100** `feat(sessions)`: delete a complete session with all videos, annotations and media;
   show the database creation time next to the training date. Stacked on #99.
7. **#101** `feat(auth)`: NL/EN e-mail OTP for the one-club allowlist (#28–#30), DB rate limits,
   revocable sessions, CSRF for JSON and tus, Resend SMTP, migration 0006, roadmap reorder, current
   production preflight and this latest Claude handoff. Stacked on #100.
8. **#89** docs: deploy logs in the runbook. Base `main`; merge whenever (resolve log conflicts by
   keeping both entries, newest first).
9. **#83** docs: ADR-0007 phone/4G measurements (#51). Base `main`.

Merging a stack: merge the bottom PR **without deleting its branch**, retarget the next one to
`main` (`gh pr edit N --base main`), wait for CI, merge, repeat. #98 is already part of #97's
branch, so after #98 merges the diff of #97 shrinks accordingly.

## The next deploy (not yet authorised; show each server step first)

Ewout asked for the product work and later asked for this handoff, but has **not** given the required
explicit `merge en deploy` approval. Do not merge or change production until he does. Before the
production `.env` edit, also confirm that `trustable.nl` is verified in Resend. Have Ewout enter the
allowlist and dedicated Resend API key privately through a terminal prompt; do not ask him to paste
addresses or the key into chat.

1. `infra/deploy/install.sh`: reinstalls the deploy script (#98) and compose file; checks
   `authorized_keys` without changing it.
2. Add the approved RowLens-only authentication settings to `/opt/rowlens/.env`: member allowlist,
   OTP pepper and Resend SMTP key. Migration 0006 creates identities, memberships, OTPs and sessions.
3. Deploy the new `sha-<7>` of `main` via the deploy workflow. Migrations 0005–0006 run automatically.
4. Verify RowLens login/mail plus the neighbours (see `AGENTS.md`), log it in the runbook.
5. Ask Ewout to re-upload his phone clips (old ones keep their wrong 31.58 fps renditions and have
   no recording time); measure the 4K processing time on the server from the worker log.

The exact required variables, safe handling constraints and current server state are in
`docs/runbooks/server-setup.md`. Keep `PILOT_ACCESS_CODE_HASH` during the first OTP deploy so rollback
remains possible; archive the old pilot code only after a real NL and EN e-mail login is verified.

## Local state on Ewout's laptop

- Checkout `/Users/ewout/src/rowlens` on branch `codex/feat/28-30-email-auth` (stacked on the two
  session improvements and the existing handoff/drawing stack). All changes are committed and pushed;
  the worktree is clean.
- Local stack running: app on **http://localhost:5174/projects/rowlens/**, login address
  **`rowlens@localhost.test`**; the API terminal prints the code. Postgres is on 5434 and the worker
  is in Docker. Local test videos/notes from development are in the local database; disposable.
- Final verification for #101: 207 web tests, 44 worker tests, 30 local E2E, 15 edge E2E, 77 deploy
  checks and the real-Docker deploy/rollback rehearsal. PRs #100 and #101 have all eight CI jobs green
  and are mergeable.

## Open work (suggested order)

1. Merge/configure/deploy the one-club e-mail login (#28–#30); verify Resend delivery before removing
   the old production access code.
2. **PR 8 of the upload plan: mark strokes (#85)**: catch/finish frames → stroke rate and
   drive:recovery ratio per stroke, traceable to frames (ADR-0009: value with evidence or refusal).
   The `annotation` table can hold marks as a new kind, or a separate table.
3. Thumbnail strip on the scrub bar (#52); "retry" for failed processing (#48).
4. Finish the one-club product hardening: deletion audit log (#43/#50), storage quota (#46) and the
   i18n framework (#34).
5. Real-device tests: 4K upload on iPhone and Android (#45), player on Android (#51); 4K transcode
   time on the server.
6. **Only after the single-club functionality is complete**: invitations, multiple memberships,
   club self-onboarding and the remaining M3 multi-club work.
7. Housekeeping for Ewout: allow GitHub Actions to create PRs (release-please), review the
   Dependabot PRs (#72 Node 26 and #73 Python 3.15 should be closed: major runtime jumps), delete
   merged/abandoned branches (`claude/feat/45-upload`, `claude/feat/59-frame-notes` were abandoned
   first pushes).

## Things that bit us (so they don't again)

- Safari ignores `height: 100%` inside an `aspect-ratio` box; the video is absolutely positioned.
- An auto-sized grid column + a percentage width = 0×0 video. Measure the stage in layout checks.
- The browser pane / Vite set `PORT`; the server takes `API_PORT` first.
- GitHub runners' disks are > 85 % full: test stacks set `DISK_PAUSE_RATIO=0.99`.
- iPhone files carry two times: `creation_time` is the export/send time, Apple's
  `com.apple.quicktime.creationdate` is when filming started.
- A `seeked` event of a superseded seek used to drop frame steps (BUG-004): keep the guard.
