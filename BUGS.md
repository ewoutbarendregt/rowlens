# BUGS

Known issues and fix status. Format: see `~/.claude/CLAUDE.md`.

### [BUG-013] Sessions-list E2E hung on the hidden filter toggle — medium
**Location**: apps/web/e2e/sessions.spec.ts:33
**Status**: fixed (claude/fix/sessions-e2e-race)
**Found**: 2026-11-03, local E2E twice, then CI on `main` after #128 (desktop Chromium, retry too); this blocked the images for `sha-2a9dfb8`
**Description**: The test asked right after loading whether the search field was visible and, if not, clicked the "Filters" toggle. On a laptop the filters open just after the first render, and since #123 the toggle is hidden there, so an early check led to a click that waited for a hidden element until the 30 s timeout (the CI trace ends on that click).
**Fix**: Wait for the filter block first, then click the toggle only when it is visible (a phone). The app's behaviour was right; the test raced it.

### [BUG-012] Player "quick presses" E2E flaked once on iPhone WebKit — low
**Location**: apps/web/e2e/player.spec.ts:42
**Status**: open
**Found**: 2026-11-02, local E2E on iPhone 13 WebKit (scratch config; not in CI)
**Description**: The frame counter didn't reach the expected frame after rapid key presses in one of four runs; three reruns passed. Chromium (CI) has never shown it. Likely timing in WebKit's seek events under load. 2026-11-03 (claude/feat/video-page-layout): again once in a full WebKit run; the player spec alone passed 3 × 7. Seen only in full runs, so load after other specs is the likely trigger.
**Fix**: —

### [BUG-011] A long word in a session title widened the page on a phone — low
**Location**: apps/web/src/client/styles.css (`.page h1`, `.lineup__boat select`)
**Status**: fixed (#116)
**Found**: 2026-11-02, CI E2E on PR #116 (mobile Chromium)
**Description**: The session heading didn't wrap long words, and the lineup's "copy from an earlier session" select grew to its longest option. With the E2E's long titles a 375 px phone page became 490–526 px wide, so a click on "Upload" landed beside the button and the upload test timed out.
**Fix**: `overflow-wrap: anywhere` on page headings; the lineup selects are capped to their grid track. The lineup E2E now asserts no horizontal overflow on a phone.

### [BUG-010] Login e-mails never left the server: outbound port 465 is blocked — high
**Location**: apps/web/src/server/auth/mail.ts (`smtpDelivery`), `/opt/rowlens/.env` (`SMTP_PORT`)
**Status**: fixed (#114, deployed `sha-6fbd5a6` with `SMTP_PORT=587`; first real login verified 2026-11-02)
**Found**: 2026-11-02, first real login on production after deploying `sha-5ee4d69`
**Description**: The runbook prescribed Resend's port 465, but trustable-prod (Hetzner) blocks outbound 465; 587 is open and is what AudioScribe uses. The code was stored and the request answered 202, but the mail connection hung for nodemailer's default 2-minute timeout, so no mail arrived and the log said nothing for minutes. Plain 587 alone would also have let a stripped STARTTLS send the API key unencrypted.
**Fix**: Port 587 with `requireTLS` (STARTTLS is mandatory on every port except 465), 10 s connection/greeting timeouts so failures show in the log quickly; unit tests for both. Server: `SMTP_PORT=587`.

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
