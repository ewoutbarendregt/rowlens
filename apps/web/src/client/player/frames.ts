/**
 * Frame arithmetic for constant-frame-rate renditions (ADR-0007). Frame n is presented from n/fps
 * until (n+1)/fps; we seek to the middle of that interval so rounding in the browser or the
 * container timescale can never land on a neighbouring frame.
 */

// Absorbs float error in presentation timestamps (e.g. 0.2999999 for frame 18 at 60 fps).
const EPSILON = 1e-4;

export function timeToFrame(seconds: number, fps: number): number {
  return Math.max(0, Math.floor(seconds * fps + EPSILON));
}

/**
 * Frame for a presentation timestamp: the *start* of a frame, as requestVideoFrameCallback reports it
 * (`mediaTime`). Containers round these (WebM to whole milliseconds: frame 10 at 30 fps starts at
 * 0.333 s, and 0.333 × 30 = 9.99), so round to the nearest frame instead of flooring.
 */
export function presentedFrame(mediaTime: number, fps: number): number {
  return Math.max(0, Math.round(mediaTime * fps));
}

export function frameToTime(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

/** Number of frames in a clip of `duration` seconds (at least 1). */
export function frameCount(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(1, Math.round(duration * fps));
}

export function clampFrame(frame: number, count: number): number {
  return Math.min(Math.max(0, Math.round(frame)), Math.max(0, count - 1));
}

/** Frame `seconds` away from `frame`, e.g. ±0.1 s → ±6 frames at 60 fps, ±3 at 30 fps. */
export function frameAfterSeconds(frame: number, seconds: number, fps: number): number {
  return frame + Math.round(seconds * fps);
}

/** `m:ss.cc` for a frame, e.g. frame 37 at 60 fps → `0:00.61`. */
export function formatFrameTime(frame: number, fps: number): string {
  const centis = Math.floor((frame / fps) * 100 + EPSILON);
  const minutes = Math.floor(centis / 6000);
  const seconds = Math.floor((centis % 6000) / 100);
  const rest = centis % 100;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}.${String(rest).padStart(2, '0')}`;
}

export interface LoopRange {
  in: number;
  out: number;
}

/** Normalises a loop so `in <= out`, both inside the clip; `null` if it covers less than 2 frames. */
export function normalizeLoop(range: LoopRange, count: number): LoopRange | null {
  const a = clampFrame(range.in, count);
  const b = clampFrame(range.out, count);
  const loop = { in: Math.min(a, b), out: Math.max(a, b) };
  return loop.out - loop.in >= 1 ? loop : null;
}

/** Where playback should jump when looping: back to `in` once `out` has been shown (or outside the loop). */
export function loopJumpTarget(frame: number, loop: LoopRange | null): number | null {
  if (loop === null) return null;
  return frame >= loop.out || frame < loop.in ? loop.in : null;
}
