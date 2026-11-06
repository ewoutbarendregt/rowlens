# BUGS

Known issues and fix status. Format: see `~/.claude/CLAUDE.md`.

### [BUG-027] Expanded inline stroke editor could widen the phone table — low
**Location**: apps/web/src/client/styles.css (`.strokes__table`)
**Status**: fixed (#149; deployed `sha-e5960c7`)
**Found**: 2026-11-06, screenshot review during the inline moment controls change
**Description**: The first implementation let expanded confirmation content size the table, producing internal horizontal scrolling and clipped text even though the page itself did not overflow.
**Fix**: Constrain table layout and action-column widths; override numeric header nowrap so headings cannot overlap. E2E checks both table scroll width/offset and document overflow, including expanded confirmation on laptop, 1000×540 and iPhone WebKit.

### [BUG-025] Ubuntu package downloads stall CI browser preparation — low
**Location**: .github/workflows/ci.yml (web fixture and edge browser installation)
**Status**: open (intermittent CI infrastructure; fresh-runner retries passed)
**Found**: 2026-11-05, CI runs 42094499020, 42093974799, 42126528172 and main CI 42128677789 / 42192694387
**Description**: Ubuntu package downloads can stall before browser tests. The first two runs reached their job time limits; #147 and main had stalled jobs cancelled and retried. The #147 edge job spent minutes downloading a 5.6 MB font package from azure.archive.ubuntu.com before retrying it. No application assertion failed in these attempts.
**Fix**: Workaround: retry the affected job on a fresh runner. The #145, #147 and final main runs passed after retry; no tests were skipped or workflow limits weakened. Track download timeouts/mirror reliability separately if this recurs.

### [BUG-024] Point placement showed an unwanted progress menu — low
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx (`.drawing-confirm`)
**Status**: fixed (#147; included in deployed `sha-e5960c7`)
**Found**: 2026-11-05, Ewout: wants the first dot directly, then the second, without a "Point 1 of 2" menu
**Description**: After the first point, the drawing controls appeared with a point counter; measurement attributes could show the strip before any point. This interrupted the requested direct point-placement flow.
**Fix**: Render drawing/measurement controls only after all two or three points are placed. The first tap still shows its visible point/ring immediately; partial angles keep their points without a menu. Adjustment, Save/Redo/Cancel and rower/joint choices remain available after completion, including fullscreen. Removed the unused NL/EN point-counter copy; no geometry or save changes.

### [BUG-023] Catch and finish removal was hidden behind toggling the exact frame — medium
**Location**: apps/web/src/client/strokes/StrokesPanel.tsx, apps/web/src/client/sessions/VideoPage.tsx
**Status**: fixed (#146; included in deployed `sha-e5960c7`)
**Found**: 2026-11-05, Ewout: catch and finish marks could not be removed through an obvious action
**Description**: The API already deletes stroke marks, but the UI only exposed deletion by pressing the same kind again on its exact frame. There was no explicit removal action for a listed catch, finish or half-slide mark.
**Fix**: The original #146 editor is replaced by #149: a coach/admin opens the trash action on a stroke row, chooses one stored moment and confirms deletion inline; loose marks remain removable. The request targets the chosen mark's frame independently of the current playback frame; errors retain the mark, and reloaded data updates timeline/timings. Keyboard/current-frame toggling remains supported. No database or permission changes.

### [BUG-022] Slow playback and pause fail intermittently on a physical iPhone after drawing — high
**Location**: apps/web/src/client/player/Player.tsx, apps/web/src/client/ui/PressButton.tsx, apps/web/src/client/drawing/DrawingLayer.tsx
**Status**: in-progress (candidate fix #145 included in deployed `sha-e5960c7`; physical iPhone confirmation pending)
**Found**: 2026-11-05, Ewout on production `sha-5ef325b`, usually after a line or angle
**Description**: On the physical iPhone, tapping 0.25×/0.5× leaves 1× selected and playback at normal speed; pause sometimes also ignores the tap. Exact production source built locally passes normal pointer/click tests (9/9), so the original physical gesture is not fully reproduced. Suppressing the compatibility mouse click in a focused WebKit test reproduces the ignored speed button (expected selected=true, got false), which identifies a matching activation failure mode rather than a media-rate calculation error.
**Fix**: Speed and play/pause buttons now activate once on a valid primary-pointer release inside the button; they keep keyboard/assistive click activation, cancel on pointer cancellation/leave, and ignore the later compatibility click to avoid toggling twice. Drawing drags explicitly release pointer capture on up/cancel and clear abandoned drags on lost capture. The missing-click regression goes from failing to passing, with actual media-clock progression and pause checks. The original physical iPhone sequence still needs confirmation; do not treat this as proof of the underlying Safari cause.

### [BUG-021] The measurement bar covered drawing points on small pictures — medium
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx, apps/web/src/client/styles.css (`.drawing-confirm`)
**Status**: fixed (#144; included in deployed `sha-e5960c7`)
**Found**: 2026-11-05, editing review at 1000×540; the bar also occupies a large part of an iPhone picture
**Description**: The rower/joint/save overlay intercepts clicks in the lower part of the video. The angle E2E passed on a large desktop but could not place a knee and ankle at y=0.7 on a low laptop window. Native WebKit selects also measured only 20 px tall despite `min-height`, making the choices hard to tap.
**Fix**: Put drawing and measurement controls directly below the picture inside the fullscreen player; keep the full picture available and explicitly size selects/buttons to 44 px. Regression checks cover overlap, touch-target height, persistence after reload and fullscreen on laptop, low laptop and iPhone WebKit. Test setup now scrolls the picture into view before coordinate input; rapid-seek coverage remains in the player suite (BUG-012 is still open).

### [BUG-020] The strokes E2E asserted a catch jump that only held while a removal was in flight — low
**Location**: apps/web/e2e/strokes.spec.ts (the ↑ check after `i`)
**Status**: fixed (opencode/docs/141-deploy)
**Found**: 2026-11-05, the `edge` CI job on the deployment-log PR (#143), twice in a row on a slower runner (27 passed, 1 failed), while it passed locally and on `main`'s merge commit minutes earlier
**Description**: The test pressed `i` (taking the catch at frame 85 off) and then asserted that ↑ lands on 85. `neighbourCatch` jumps to the previous catch *strictly before* the frame, so once the deletion had landed the jump went to 50; the assertion only held while the sidebar still showed the old marks, which is why it passed on a fast machine and failed under load.
**Fix**: Check ↑ (85 → 50) and ↓ (50 → 85) with every mark in place, before taking the catch off.

### [BUG-019] A just-selected drawing was dropped again on WebKit — medium
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx (`.drawing__catcher`)
**Status**: fixed (opencode/feat/141-draggable-drawings)
**Found**: 2026-11-05, iPhone 13 WebKit check on the edge stack (scratch spec, touch)
**Description**: A tap on a saved drawing selected it (rings appeared) and the same tap dropped it: the catcher that carries the presses of a selected drawing is mounted *during* that press, and WebKit sends the click to whatever is under the finger when it lifts — the catcher — so its "tap beside it drops the selection" handler ran on the very tap that selected. Chromium sends the click to the common ancestor of press and release and happened to be fine, so the desktop E2E passed while a real Safari would not.
**Fix**: The catcher drops a selection only when the press started on it (`catcherPress` ref, reset on every press and on a drag).

### [BUG-018] The invisible press area of a point skipped its own centre (Chromium) — medium
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx, apps/web/src/client/styles.css (`.drawing__handle-hit`)
**Status**: fixed (opencode/feat/141-draggable-drawings)
**Found**: 2026-11-05, edge E2E: pressing a ring of a selected boat line hit the catcher instead of the ring, so nothing could be dragged
**Description**: The ring's press area was a transparent `<circle>` with `pointer-events: stroke`, 56 px wide through `vector-effect: non-scaling-stroke`. In Chromium the hit area of that non-scaling stroke does not cover the circle's centre: probing showed the catcher at the centre and at ±12 px, the circle only from ~20 px outwards. The painted strokes (lines, dash patterns) are unaffected, which is why only small circles showed it. Measured with a scratch page (`elementFromPoint` at offsets) before changing anything.
**Fix**: The press is never tested by the DOM: the layer finds the nearest point of the selected drawing in screen pixels (`handleAt`, 28 px reach, the same as while drawing) on a catcher that sits on top of the drawings. The rings are what you see.

### [BUG-017] Boat-line taps in the angles E2E don't register on emulated iPhone WebKit — low
**Location**: apps/web/e2e/angles.spec.ts:61, apps/web/src/client/drawing/DrawingLayer.tsx (suspected)
**Status**: open
**Found**: 2026-11-03, edge E2E on Playwright's iPhone 13 WebKit with touch (scratch config)
**Description**: After "Draw boat line" the two `touchscreen.tap`s place no point, so the test times out with the prompt still open. The same run on `main` fails the same way, so it predates the zoom change; drawing a line with a finger on a zoomed picture in the same setup works. Unknown whether a real iPhone is affected (the coaches drew boat lines on one after #135).
**Fix**: —

### [BUG-016] A rower added in the lineup is sometimes missing after saving — medium
**Location**: apps/web/src/client/lineup/LineupCard.tsx, apps/web/src/client/rowers/RowerPicker.tsx (suspected)
**Status**: open
**Found**: 2026-11-03, local edge E2E while the Mac was under load (load average 6–17)
**Description**: In four edge runs the last rower picked or added inline into a lineup was missing from the saved lineup (lineup.spec: the stroke seat empty after a reload although it showed the name before Save; angles.spec and sessions.spec failing because of the missing rower). Not seen in CI and not tied to the change being tested. Cause not found yet; candidates are the inline add finishing after Save, or a page reload of the session overwriting the seats. Update 2026-11-03: one cause of lineup.spec failures on a local edge database kept between runs: the test searched the picker with `desktopchrom`, which matches every earlier run's Anna, and the picker shows 8 matches, so the new one was missing. The test now searches by its whole tag. The original symptom (a picked rower missing after Save) is not explained by this.
**Fix**: —

### [BUG-015] With classic (always visible) scrollbars the video tools row wraps at 1000 px — low
**Location**: apps/web/src/client/styles.css (`.player__toolbar`)
**Status**: open
**Found**: 2026-11-03, layout check on claude/feat/angle-measures
**Description**: The tools row above the picture needs 621 px. At a 1000 px window with overlay scrollbars (the macOS default) the player column is 628 px wide and it fits; with a 15 px scrollbar it is 613 px, the row wraps and the player column at 1000×540 is 546 px instead of 512, so its bottom row needs a little scroll. The video keeps its size.
**Fix**: —

### [BUG-014] Merging roster entries can fail when one sat in a session the merger can't see — medium
**Location**: apps/web/src/server/api/lineups.ts (`mergeLineupSeats`), apps/web/src/server/api/moments.ts (`mergeMomentRowers`)
**Status**: open
**Found**: 2026-11-03, while adding angle measurements to the merge
**Description**: Since #108 coaches see only their own sessions. A merge runs with the merging member's role policies, so lineup seats or note assignments in sessions they can't see are skipped, and deleting the merged rower then hits the restricting foreign key (an error instead of a merge). Angle measurements avoid this through a definer function limited to the club (ADR-0017).
**Fix**: — (same approach as `rowlens_merge_angle_measures`, or let only the admin merge).

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
**Fix**: —. Reproduced 2026-11-05 in the strokes WebKit setup (10 quick steps landed on frame 8); that setup now waits for each step so deletion can be tested independently. The dedicated player quick-press regression is unchanged; the app issue remains open.

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
