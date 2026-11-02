import type { DrawingKind, Point } from '../drawing/geometry.ts';
import { moments } from './moments.ts';

export const NOTE_HOLD_SECONDS = 1;
export const NOTES_VISIBLE_KEY = 'rowlens.videoNotes.visible';
export const NOTE_HOLD_KEY = 'rowlens.videoNotes.holdSeconds';
export const NOTE_HOLD_OPTIONS = [0.5, 1, 2] as const;
export type NoteHoldSeconds = (typeof NOTE_HOLD_OPTIONS)[number];

export interface OverlayAnnotation {
  id: string;
  frame: number;
  kind: 'note' | DrawingKind;
  body: string;
  authorName: string;
  shape: { points: Point[] } | null;
}

export type OverlayMoment = ReturnType<typeof moments<OverlayAnnotation>>[number];
export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Notes are on by default. Private browsing and blocked storage must not break the player. */
export function storedNotesVisible(storage: StorageLike = localStorage): boolean {
  try {
    return storage.getItem(NOTES_VISIBLE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function rememberNotesVisible(visible: boolean, storage: StorageLike = localStorage): void {
  try {
    storage.setItem(NOTES_VISIBLE_KEY, visible ? 'on' : 'off');
  } catch {
    // The choice lasts for this page when storage is unavailable.
  }
}

export function storedNoteHoldSeconds(storage: StorageLike = localStorage): NoteHoldSeconds {
  try {
    const value = Number(storage.getItem(NOTE_HOLD_KEY));
    return NOTE_HOLD_OPTIONS.find((option) => option === value) ?? NOTE_HOLD_SECONDS;
  } catch {
    return NOTE_HOLD_SECONDS;
  }
}

export function rememberNoteHoldSeconds(
  seconds: NoteHoldSeconds,
  storage: StorageLike = localStorage,
): void {
  try {
    storage.setItem(NOTE_HOLD_KEY, String(seconds));
  } catch {
    // The choice lasts for this page when storage is unavailable.
  }
}

/** Group the annotations into video moments, optionally keeping one rower's assigned notes. */
export function videoMoments(
  annotations: readonly OverlayAnnotation[],
  frames: ReadonlySet<number> | null,
): OverlayMoment[] {
  return moments(frames === null ? annotations : annotations.filter((a) => frames.has(a.frame)));
}

/**
 * The latest moment reached by the playhead. It remains on screen for a short hold after its exact
 * frame, so an explanation is readable during playback; a later moment takes precedence.
 */
export function activeVideoMoment(
  all: readonly OverlayMoment[],
  frame: number,
  fps: number,
  holdSeconds = NOTE_HOLD_SECONDS,
): OverlayMoment | null {
  const holdFrames = Math.max(1, Math.round(fps * holdSeconds));
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const candidate = all[i];
    if (candidate === undefined || candidate.frame > frame) continue;
    return frame - candidate.frame < holdFrames ? candidate : null;
  }
  return null;
}

/** Put the text in the corner furthest from the drawing's sampled points. */
export function overlayPosition(moment: OverlayMoment): OverlayPosition {
  const samples: Point[] = [];
  for (const drawing of moment.drawings) {
    const points = drawing.shape?.points ?? [];
    samples.push(...points);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (a !== undefined && b !== undefined) samples.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
  }
  if (samples.length === 0) return 'bottom-left';

  const anchors: readonly [OverlayPosition, Point][] = [
    ['bottom-left', [0.18, 0.82]],
    ['bottom-right', [0.82, 0.82]],
    ['top-left', [0.18, 0.18]],
    ['top-right', [0.82, 0.18]],
  ];
  let best: [OverlayPosition, Point] = ['bottom-left', [0.18, 0.82]];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of anchors) {
    const [, [x, y]] = candidate;
    const score = samples.reduce((sum, [px, py]) => {
      const distanceSquared = (x - px) ** 2 + (y - py) ** 2;
      return sum + 1 / (0.04 + distanceSquared);
    }, 0);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best[0];
}
