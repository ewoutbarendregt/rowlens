# ADR-0007: Upload, transcoding and frame-accurate playback

- **Status**: proposed (playback details confirmed by a spike in M1)
- **Date**: 2026-11-01

## Context

Coaches upload ~2-min clips (up to 4K, 30–60 fps, sometimes 120/240 fps slow-mo) from phone browsers.
Rowers must see the catch and extraction frame by frame: playback ≤ ~2 s start on 4G, instant frame steps,
0.25×/0.5×/1×, loop, fullscreen on iOS Safari and Android Chrome. Phones record **variable frame rate**
and iPhones default to **HEVC**, which Chrome/Android doesn't reliably decode.

## Decision

**Upload** — tus 1.0 at `${BASE_PATH}/api/uploads`, 16 MB chunks (fits the 64 MB Caddy body limit),
straight into the object store via `@tus/s3-store` (multipart). Auth cookie + per-session upload grant;
type check by magic bytes + `ffprobe` (not by extension), size and per-club quota checks before accepting,
rate limit per user. Upload completion enqueues a `video.probe` → `video.transcode` job.

**Transcode** (worker, ffmpeg, CPU-limited, `nice`):
- Normalise to **constant frame rate at the source's nominal rate** (e.g. 59.94 → 60000/1001), keeping a
  mapping from original PTS so frame indices in annotations/analysis are stable and documented.
- Renditions, all **H.264 High + AAC, MP4, `+faststart`**, fps preserved:
  - `play-1080` (≤1080p): **short closed GOP ≈ 0.25 s** (`-g ≈ fps/4`, `-keyint_min` same, no scene-cut),
    so seeking/backward stepping decodes ≤ ~15 frames.
  - `play-540` (≤540p, lower bitrate) for slow 4G; the player picks by network/viewport.
  - `poster.jpg`, sprite of thumbnails for the scrub bar.
  - Sources > 60 fps keep their rate (the point of slow-mo) but get a size warning in the UI.
- Original kept untouched (HEVC fine) for analysis and re-transcoding.
- Technical metadata (fps, resolution, duration, codec, rotation, VFR flag) stored on `video`.

**Playback** — native `<video>` with custom controls:
- Frame stepping: seek to `(n + 0.5) / fps`, read exact presented frame via
  `requestVideoFrameCallback` (`mediaTime`), all modern Safari/Chrome support it; fall back to time-based
  stepping with a visible "approximate" indicator.
- Buttons ±1 frame, ±0.1 s, ±1 s sized ≥ 44 px; keyboard `,`/`.` (frame), `←`/`→` (0.1 s / 1 s with Shift),
  `space`, `[`/`]` loop in/out, `L` loop toggle; rates 0.25/0.5/1 (+0.1, 2 optional).
- Fullscreen: Fullscreen API on the player container where available; **iPhone Safari only allows native
  fullscreen on `<video>`** (custom controls disappear), so on iPhone we use a CSS "immersive" mode
  (fixed full-viewport container, landscape hint) instead and offer native fullscreen as a secondary option.
- Delivery: the API authorises and then streams byte ranges from the object store (`Range`/`206`), or
  redirects to a 5-minute presigned URL when the backend is reachable publicly (Hetzner Object Storage).
  Cache-Control `private`. No public links.
- **M1 spike (first sprint)**: measure start time on throttled 4G and step latency on iPhone + Android
  with GOP 0.25 s vs. 0.5 s vs. all-intra 540p; record results in this ADR.

## Spike results (#51, 2026-11-01, desktop)

Demo page `/projects/rowlens/demo/player` (dev builds only, `VITE_FEATURE_PLAYER_DEMO`), clips from
`pnpm demo:media` with the frame number burned into every frame. Measured with headless Google Chrome
(H.264) and Playwright Chromium (VP9), stepping 90 frames forward and back across keyframes:

| Rendition | Wrong frames | Step → frame shown (median / p95) | Loop 100–160 at 1× |
|---|---|---|---|
| H.264 60 fps, GOP 0.25 s, 1080p | 0 | 15.6 / 21 ms | ≤ 2 frames past the end |
| H.264 60 fps, GOP 0.5 s, 1080p | 0 | 15.9 / 21 ms | ≤ 2 frames past the end |
| H.264 60 fps, all-intra, 540p | 0 | 15.6 / 20 ms | ≤ 2 frames past the end |

A step costs one display refresh on a laptop; GOP length makes no measurable difference there. It is
expected to matter on phones (weaker decoders), which is still to be measured: iPhone Safari and Android
Chrome over the LAN (`pnpm --filter @rowlens/web dev:client --host`). Until then **GOP 0.25 s stays**.

What the spike changed in the design:
- **Frame from `mediaTime` is rounded, not floored.** Containers round presentation timestamps (WebM to
  1 ms: frame 10 at 30 fps starts at 0.333 s → 9.99 → floored to frame 9). `currentTime`, which can be
  anywhere inside a frame, is still floored.
- **A pending step target is cleared on `seeked`**, not only when the presented frame equals it;
  otherwise one mis-mapped frame made every later step count from a stale base.
- **Looping pauses, seeks while paused, then resumes.** Seeking while playing took ~1 s in Chromium and
  overshot the loop by ~60 frames at 1×; re-seeking on every frame during a seek cancelled it repeatedly.
- **Hidden tabs/panes don't paint frames**, so `requestVideoFrameCallback` doesn't fire there; timing
  measurements are only valid on a visible page.
- Feature-flagged pages must be excluded with a standalone exported constant read via dot notation,
  plus a build step that drops unreachable chunks (Rolldown keeps emitting them).

### As implemented (#47, 2026-11-01)

- One ffmpeg run per video: decode once, `split` into the renditions. Each is H.264 High, `veryfast`,
  CRF 21 (play-1080) / 25 (play-540), `-fps_mode cfr -r <nominal>`, `-g = -keyint_min = round(fps/4)`,
  `-sc_threshold 0`, closed GOP, AAC 128k stereo, `+faststart`. Shorter side ≤ 1080 / ≤ 540, never
  upscaled; a source with a shorter side ≤ 540 gets play-540 only. ffmpeg auto-rotates, so portrait
  phone video comes out upright.
- **Metadata is stripped** from renditions and poster (`-map_metadata -1`): phone videos carry GPS
  location and device names. The original keeps it but is never served.
- Nominal rate: `r_frame_rate` unless it's implausible (> 240, or > 20 % off the average, as with
  Android files reporting 90000/1); then the average, snapped to the nearest common rate within 1 %.
  The VFR flag is a heuristic (average > 0.5 % off the nominal rate).
- Refused for good (job dead, video `failed` with a reason): no video stream, unreadable, > 30 min,
  > 240 fps.
- Checked on a synthetic 4K60 HEVC portrait clip with a 90° display matrix and a GPS tag: probe
  2160×3840 @ 60, renditions 1080×1920 and 540×960 at 60/1 with all 180 frames, GPS gone.
  Keyframes every 8 frames at 30 fps on the E2E clip. Server timing to be measured after deploy.

## Consequences

- One 2-min 4K60 transcode is CPU-heavy (several minutes on 2 vCPU); acceptable with background processing
  and progress UI, revisit if the queue backs up.
- Short GOP increases rendition size ~20–40 % vs. default GOP; storage budget in ADR-0006 accounts for it.

## Alternatives considered

- **HLS/DASH** — adaptive bitrate, but frame-accurate seeking is worse and complexity higher. Revisit if
  start-time targets aren't met with progressive MP4.
- **WebCodecs frame decoder** — most precise, but large effort and uneven iOS support. Kept as fallback.
