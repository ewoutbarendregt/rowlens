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

## Consequences

- One 2-min 4K60 transcode is CPU-heavy (several minutes on 2 vCPU); acceptable with background processing
  and progress UI, revisit if the queue backs up.
- Short GOP increases rendition size ~20–40 % vs. default GOP; storage budget in ADR-0006 accounts for it.

## Alternatives considered

- **HLS/DASH** — adaptive bitrate, but frame-accurate seeking is worse and complexity higher. Revisit if
  start-time targets aren't met with progressive MP4.
- **WebCodecs frame decoder** — most precise, but large effort and uneven iOS support. Kept as fallback.
