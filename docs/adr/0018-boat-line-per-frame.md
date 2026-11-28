# ADR-0018: The boat line found in every frame, the coach's line wins

- **Status**: withdrawn (2026-11-28)
- **Date**: 2026-11-04
- **Deciders**: Ewout (product owner), Claude (lead engineer)

## Withdrawn (2026-11-28)

Ewout (2026-11-28): after an upload a video should simply be there to add notes to; finding the
waterline is no longer needed. The worker job `video.boat_line`, `analysis/waterline.py`, the
`auto-boat-line` API, the dotted line, the bow-side choice and the `AUTO_BOAT_LINE` build flag are
removed, and so are the worker's `opencv-python-headless` and `numpy`. After upload the worker only
makes the playback renditions (ADR-0007). A coach's own boat line (ADR-0017) stays for the upper
body angle. The table `video_auto_boat_line` stays in the database, unused and unread; dropping it
is a later, separate migration. Queued `video.boat_line` jobs in production are no longer claimed
by any worker and stay queued, harmlessly.

The rest of this ADR is the original decision, kept for the record.

## Context

The upper body is measured against the boat line (ADR-0017). A moving camera turns the boat in the
picture quickly, so coaches set several lines per video, and drawing one with a finger is fiddly.
Ewout (2026-11-03): determine the boat line automatically in every frame, from where the bow meets
the water to where the stern does, and follow the waterline when the boat is not fully in the
picture.

A spike on three of the club's own videos (white coastal boats in fog, filmed from a coach boat)
showed that classical image processing finds the hull's bottom edge well in side views, including
close-ups where the boat runs out of the picture, at 1–1.5 ms per frame. It fails or gives no line
on views from the front or behind, and once in a while on a wake or a white wall on the bank. Dark
hulls, backlight and sun were not in the sample.

## Decision

- **Where it runs**: the worker, after processing a video (job `video.boat_line`, queued in the same
  transaction that marks the video ready) and for videos already ready (migration 0017). Nothing
  leaves the server; no model, no external provider (ADR-0010 doesn't apply). Dependencies:
  `opencv-python-headless` and `numpy`.
- **How it finds the line** (`worker/src/rowlens_worker/analysis/waterline.py`): at 480 px on the
  long side, a vertical top-hat keeps light, thin, unsaturated structures (a hull against water and
  crew); the hull is the long flat region in the water with a crew on it (pixels darker than the water
  below it, or strongly coloured), preferring the lowest (nearest) and, while following, the one near
  the last line; its lowest pixels per column give a robust line; the ends are walked outward to the
  bow and stern tips, or to the picture's edge. Smoothed frame to frame.
- **Stored** per video in `video_auto_boat_line` (RLS like the boat lines: everyone who sees the
  video reads, coaches and the admin write): per frame `[x0, y0, x1, y1, confidence]`, left end first,
  or null. Status `queued → running → done | failed`, the detector version, and `bow_side`.
- **The coach wins**: on a frame with a coach's line, that line applies. Elsewhere the found line
  applies; where none was found, the coach's lines as before (from their frame on). Every change to a
  coach's line queues one new search, which restarts its following from the coach's lines
  (`shared/angles.ts` `resolveBoatLine`).
- **Bow side**: the picture doesn't say which end is the bow. It is taken from the nearest coach's
  line; without any, a coach picks "bow left / right" once per video. Until then an upper-body value
  on a found line is refused with `no_bow_side`.
- **On screen**: the found line is dotted, a coach's line dashed. The Angles tab says whether the line
  here was found or set, how many frames have one, and offers "Correct it here".
- **Switch**: `VITE_FEATURE_AUTO_BOAT_LINE=false` builds the app without showing or using found lines
  (the worker keeps finding them).

## Consequences

- Coaches draw a boat line only where the found one is wrong or missing; upper-body values follow the
  camera frame by frame.
- Wrong lines are possible (front/back views, wakes); the dotted line and the "found" text make them
  visible, and one coach's line corrects that frame and steers the search around it.
- One frame entry per frame: ~35 bytes each, so ~120 kB for a two-minute video, fetched on its own
  (`GET /api/videos/:id/auto-boat-line`), not with every angles load.
- The worker image grows by about 60 MB; the search costs a few seconds per video on the server, at
  low priority.
- The waterline is also a start for later analysis (boat pitch and roll, #127 group E).
