# BUGS

Known issues and fix status. Format: see `~/.claude/CLAUDE.md`.

### [BUG-009] A first deploy could silently skip the migrations — high
**Location**: infra/deploy/rowlens-deploy (`migrate`)
**Status**: fixed (needs the deploy script reinstalled with `install.sh` at the next deploy)
**Found**: 2026-11-01, CI rehearsal on PR #97
**Description**: `migrate` asked `docker compose config` whether a migrate service exists, without ROWLENS_TAG and with errors suppressed. On a first deploy there is no release.env to supply the tag; newer Compose enforces `${ROWLENS_TAG:?}` during `config`, so the check failed, read as "no migrate service", the migrations were skipped and the app couldn't log in to the database. Production (release.env present) was not affected.
**Fix**: pass the tag; a failing `config` stops the deploy (exit 2) before anything restarts. Stub tests: config sees the tag; config failure stops the deploy (both fail on the old script).
### [BUG-007] Phone clip processed at 31.58 fps instead of 30, ~5 % duplicate frames — high
**Location**: worker/src/rowlens_worker/video/probe.py (`_nominal`)
**Status**: fixed (videos processed before stay as they are; re-upload to fix)
**Found**: 2026-11-01, Ewout's screenshot showed "31.58 fps"
**Description**: The clip's frames sit on a 600 Hz timestamp grid, 19 ticks apart with gaps (r_frame_rate 600/19 = 31.58, average 29.99). The worker took r_frame_rate because it was within 20 % of the average, and made a constant 31.58 fps rendition: 2740 frames from 2603, so ~5 % duplicates — misleading when stepping frame by frame.
**Fix**: prefer the average if it is a common rate (within 1 %), then r_frame_rate if common, then the old rule. Test with the clip's real numbers.

### [BUG-008] Portrait video on a laptop: a narrow strip, controls stretched below — medium
**Location**: apps/web/src/client/styles.css (video page layout)
**Status**: fixed
**Found**: 2026-11-01, Ewout's laptop screenshot ("this does not look good on the laptop")
**Description**: The laptop layout put controls under the video, sized for landscape. A portrait video got the height left over (small in a low window) and lots of empty space beside it.
**Fix**: from 1000 px, portrait video stands left at full available height, its controls in a column beside it, notes on the right. Two attempts made the video 0×0 (an auto margin, then a percentage width inside an auto-sized column); both caught by measuring the stage size in the layout script.

### [BUG-005] iPhone shows only the top of a portrait video — high
**Location**: apps/web/src/client/styles.css (`.player__stage`, `.player__video`)
**Status**: fixed (in production until the next deploy)
**Found**: 2026-11-01, by Ewout on his iPhone ("alleen de bovenste helft")
**Description**: The stage was a 16:9 box (aspect-ratio) with the video at `height: 100%`. Safari ignores that percentage inside an aspect-ratio box, so a portrait video (540×960) became 358×636 px inside a 358×201 stage and was cut off. Chrome sized it correctly, so the Chromium tests passed.
**Fix**: video absolutely positioned in the stage; the stage takes the video's own shape (`--aspect`), at most 60 % of the screen height on phones; checked in WebKit at iPhone size (landscape, portrait, full screen).

### [BUG-006] Flaky test: broken upload connection — low
**Location**: apps/web/src/server/media/store.test.ts:32
**Status**: fixed
**Found**: 2026-11-01
**Description**: The test broke the stream after a fixed 20 ms, sometimes before the first chunk reached the disk.
**Fix**: break it once the bytes are on disk; 15/15 passes.

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
