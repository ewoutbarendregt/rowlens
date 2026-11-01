# BUGS

Known issues and fix status. Format: see `~/.claude/CLAUDE.md`.

### [BUG-004] Quick frame steps get lost (player) — high
**Location**: apps/web/src/client/player/usePlayer.ts:102
**Status**: fixed (in production until the next deploy)
**Found**: 2026-11-01, by the notes E2E (10 quick `.` presses ended at frame 4, 7 or 9)
**Description**: `onSeeked` cleared the pending step target unconditionally. A `seeked` of a seek that a newer step had already replaced, or a step right after a seek but before requestVideoFrameCallback reported the new frame, made the next step count from an older frame. Every lost step is a wrong frame for a rower or coach pressing or holding the step buttons.
**Fix**: ignore `seeked` while a newer seek is in flight (`video.seeking`); on a finished seek, count on from the seek's target. Regression test: 20 quick presses must land on frame 20 (fails 12/12 with the old code, passes 12/12 now).

### [BUG-003] Renditions 3× larger than low-bitrate phone uploads — medium
**Location**: worker/src/rowlens_worker/video/transcode.py:34
**Status**: fixed
**Found**: 2026-11-01 (first real clip on production)
**Description**: A 576p, 0.76 Mbit/s, 8 MB upload got 27 MB of renditions: play-1080 was produced for any source above 540p (a near-copy at 576p), and CRF had no bitrate ceiling. That eats the 30 GB cap three times faster than needed.
**Fix**: play-1080 only from 720p; capped CRF relative to the source bitrate (PR, see DOCUMENTATION 2026-11-01).

### [BUG-002] Edge E2E upload refused with 507 on CI runners — low
**Location**: infra/compose/docker-compose.edge.yml:34
**Status**: fixed
**Found**: 2026-11-01
**Description**: GitHub runners' disks are above 85 % in use once Docker images and Chrome are installed, so the 85 % disk pause (ADR-0006) refused every test upload (507 `disk_full`). Earlier PRs never ran the upload in the edge job (no test clip there before #90).
**Fix**: test stacks (edge compose, e2e/server.ts) set `DISK_PAUSE_RATIO=0.99`; production keeps 0.85 (PR #90).

### [BUG-001] E2E server fails to start once DATABASE_URL is required in production — medium
**Location**: apps/web/playwright.config.ts:30
**Status**: fixed
**Found**: 2026-11-01
**Description**: #86 made `DATABASE_URL` required with `NODE_ENV=production`; Playwright's web server ran `dist/server/main.js` in production mode without a database, so CI's E2E step couldn't start (local checks had covered the edge stack, not this suite).
**Fix**: `e2e/server.ts` starts a throwaway Postgres via Testcontainers, migrates it, then runs the server (PR #86).
