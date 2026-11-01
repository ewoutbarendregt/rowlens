# Handoff — state of RowLens on 2026-11-01 (evening)

Written when Ewout moved from Claude Code to Codex. Read `AGENTS.md` first for the rules. Details
of everything below are in `DOCUMENTATION.md` (newest first), `BUILD.md`, `BUGS.md`, `TEST.md`,
the ADRs in `docs/adr/` and the server runbook `docs/runbooks/server-setup.md`.

## What exists

| Area | State |
|---|---|
| Hosting | Own Compose project `rowlens` in `/opt/rowlens` on trustable-prod; Caddy route `/projects/rowlens/*`; manual deploy workflow with backup, migrations, readiness check and automatic rollback |
| Access | Pilot access code (#84) instead of login: one shared code for the pilot club; code hash in the server `.env` |
| Data | Postgres 16, Drizzle migrations 0000–0005, role `rowlens_app` without BYPASSRLS, `withTenant` + RLS on every tenant table |
| Upload | Sessions; resumable tus upload (own server) into `/opt/rowlens/media`; 4 GB per file, 30 GB total cap, 85 % disk pause |
| Processing | Python worker: ffprobe, CFR H.264 renditions play-1080/play-540 (GOP ≈ 0.25 s, metadata stripped), poster, Postgres job queue |
| Player | Frame-accurate stepping, 0.25/0.5/1×, loop, full screen; portrait/landscape layouts on phone and laptop |
| Analysis (manual) | Notes, lines, arrows and angles at a frame; one section per frame; delete per item or per frame |

## Production

- Runs **`sha-c15cb47`** (deployed 2026-11-01 19:34 UTC): everything up to iPhone/laptop layout
  (#94) and notes (#93). **Not yet on production**: everything in the open PRs below.
- Previous release `sha-4e03e66` is kept for rollback (`rowlens-deploy rollback`).
- The pilot access code is in `/opt/rowlens/pilot-code.txt` (mode 600, readable by `deploy` only);
  Ewout reads it himself (`ssh trustable-prod cat /opt/rowlens/pilot-code.txt`).
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
   Stacked on #96. (CI was still running when this was written.)
5. **This handoff PR** (`AGENTS.md`, this file). Stacked on #97.
6. **#89** docs: deploy logs in the runbook. Base `main`; merge whenever (resolve log conflicts by
   keeping both entries, newest first).
7. **#83** docs: ADR-0007 phone/4G measurements (#51). Base `main`.

Merging a stack: merge the bottom PR **without deleting its branch**, retarget the next one to
`main` (`gh pr edit N --base main`), wait for CI, merge, repeat. #98 is already part of #97's
branch, so after #98 merges the diff of #97 shrinks accordingly.

## The next deploy (when Ewout asks; show each server step first)

1. `infra/deploy/install.sh`: reinstalls the deploy script (#98) and compose file; checks
   `authorized_keys` without changing it.
2. Deploy the new `sha-<7>` of `main` via the deploy workflow. Migration 0005 (video numbers and
   recording time) runs automatically. No new secrets.
3. Verify RowLens and the neighbours (see `AGENTS.md`), log it in the runbook.
4. Ask Ewout to re-upload his phone clips (old ones keep their wrong 31.58 fps renditions and have
   no recording time); measure the 4K processing time on the server from the worker log.

## Local state on Ewout's laptop

- Checkout `/Users/ewout/src/rowlens` on branch `claude/docs/handoff-codex` (top of the stack).
- Local stack running: app on **http://localhost:5174/projects/rowlens/**, access code
  **`rowlens-lokaal`** (only in the git-ignored `apps/web/.env`), Postgres on 5434, worker in
  Docker. Local test videos/notes from development are in the local database; disposable.

## Open work (suggested order)

1. **PR 8 of the upload plan: mark strokes (#85)**: catch/finish frames → stroke rate and
   drive:recovery ratio per stroke, traceable to frames (ADR-0009: value with evidence or refusal).
   The `annotation` table can hold marks as a new kind, or a separate table.
2. Thumbnail strip on the scrub bar (#52); "retry" for failed processing (#48).
3. Real-device tests: 4K upload on iPhone and Android (#45), player on Android (#51); 4K transcode
   time on the server.
4. Before more clubs or real users: login with e-mail codes (#28–#30) replacing the pilot code,
   audit log for deletions (#43/#50), per-club storage quota (#46), i18n framework (#34).
5. Housekeeping for Ewout: allow GitHub Actions to create PRs (release-please), review the
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
- Docker Compose interpolates `$` in `.env` and YAML: the pilot code hash uses dots.
- A `seeked` event of a superseded seek used to drop frame steps (BUG-004): keep the guard.
