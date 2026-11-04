import { angleDegrees, type Point, type Size, toPixels } from './geometry.ts';
import type { StrokeSummary } from './strokes.ts';

/**
 * Angles per rower and phase (ADR-0017): the coach taps the points on a frame with a stroke mark,
 * RowLens computes the angle and gathers them per rower, joint and phase. Pure; the frame and the
 * points are the evidence for every value.
 */
export const JOINTS = ['knee', 'hip', 'elbow', 'trunk'] as const;
export type Joint = (typeof JOINTS)[number];

/** How many points each measurement takes, in order (see ADR-0017). */
export const JOINT_POINTS: Record<Joint, number> = { knee: 3, hip: 3, elbow: 3, trunk: 2 };

export const PHASES = ['catch', 'half_slide_drive', 'finish', 'half_slide_recovery'] as const;
export type Phase = (typeof PHASES)[number];

export interface AngleMeasure {
  id: string;
  frame: number;
  rowerId: string;
  joint: Joint;
  points: Point[];
}

/** Bow side first, then stern side: the boat's direction, so "forward" is known. */
export type BoatLine = readonly [Point, Point];

/** A boat line from its frame on, until the next one (a moving camera turns the boat). */
export interface FrameBoatLine {
  frame: number;
  points: BoatLine;
}

/**
 * The boat line for a frame: the last one set at or before it; before the first one, the first
 * (nearest in time). Null when the video has none.
 */
export function boatLineAt(frame: number, lines: readonly FrameBoatLine[]): FrameBoatLine | null {
  const sorted = [...lines].sort((a, b) => a.frame - b.frame);
  return sorted.filter((l) => l.frame <= frame).at(-1) ?? sorted[0] ?? null;
}

/**
 * The boat line found in every frame by the worker (ADR-0018): per frame `[x0, y0, x1, y1,
 * confidence]`, left end first, or null. `bowSide` is a coach's choice of which end is the bow.
 */
export type AutoFrame = readonly [number, number, number, number, number] | null;
export interface AutoBoatLines {
  frames: readonly AutoFrame[];
  bowSide: 'left' | 'right' | null;
}

export type ResolvedBoatLine =
  | { source: 'coach'; frame: number; points: BoatLine }
  /** `points` bow side first, or null while nobody said which end is the bow. */
  | { source: 'auto'; frame: number; points: BoatLine | null; ends: BoatLine; confidence: number };

/**
 * The boat line on a frame (ADR-0018): a coach's line on exactly this frame wins; otherwise the
 * line found on this frame, its bow side taken from the nearest coach's line or the coach's
 * choice; otherwise the coach's lines as before (`boatLineAt`).
 */
export function resolveBoatLine(
  frame: number,
  coach: readonly FrameBoatLine[],
  auto: AutoBoatLines | null,
): ResolvedBoatLine | null {
  const exact = coach.find((l) => l.frame === frame);
  if (exact !== undefined) return { source: 'coach', frame, points: exact.points };
  const found = auto?.frames[frame] ?? null;
  if (found !== null) {
    const [x0, y0, x1, y1, confidence] = found;
    const left: Point = [x0, y0];
    const right: Point = [x1, y1];
    const nearest = [...coach].sort(
      (a, b) => Math.abs(a.frame - frame) - Math.abs(b.frame - frame),
    )[0];
    const bowLeft =
      nearest !== undefined
        ? nearest.points[0][0] < nearest.points[1][0]
        : auto?.bowSide === null || auto === null
          ? null
          : auto.bowSide === 'left';
    return {
      source: 'auto',
      frame,
      points: bowLeft === null ? null : bowLeft ? [left, right] : [right, left],
      ends: [left, right],
      confidence,
    };
  }
  const line = boatLineAt(frame, coach);
  return line === null ? null : { source: 'coach', frame: line.frame, points: line.points };
}

export type AngleRefusal = 'no_boat_line' | 'no_bow_side' | 'bad_points';

/**
 * A measurement's value with the boat line that applies on its frame (ADR-0018): a found line
 * whose bow side nobody gave can't say forward from back, so the upper body is refused for that.
 */
export function measureAt(
  m: Pick<AngleMeasure, 'joint' | 'points' | 'frame'>,
  size: Size,
  coach: readonly FrameBoatLine[],
  auto: AutoBoatLines | null,
): AngleValue {
  const line = resolveBoatLine(m.frame, coach, auto);
  if (m.joint === 'trunk' && line !== null && line.points === null) {
    return { ok: false, reason: 'no_bow_side' };
  }
  return measureValue(m, size, line?.points ?? null);
}

export type AngleValue = { ok: true; degrees: number } | { ok: false; reason: AngleRefusal };

/**
 * A joint's inner angle at its middle point (0–180°), or the upper body's lean from the
 * perpendicular to the boat line: positive leaning forward (shoulders toward the stern), negative
 * leaning back.
 */
export function measureValue(
  measure: Pick<AngleMeasure, 'joint' | 'points'>,
  size: Size,
  boatLine: BoatLine | null,
): AngleValue {
  const [a, b, c] = measure.points;
  if (measure.points.length !== JOINT_POINTS[measure.joint] || a === undefined || b === undefined) {
    return { ok: false, reason: 'bad_points' };
  }
  if (measure.joint !== 'trunk') {
    if (c === undefined) return { ok: false, reason: 'bad_points' };
    return { ok: true, degrees: angleDegrees(a, b, c, size) };
  }
  if (boatLine === null) return { ok: false, reason: 'no_boat_line' };
  return { ok: true, degrees: trunkLean(a, b, boatLine, size) };
}

function trunkLean(hip: Point, shoulder: Point, [bow, stern]: BoatLine, size: Size): number {
  const [bx, by] = toPixels(bow, size);
  const [sx, sy] = toPixels(stern, size);
  const length = Math.hypot(sx - bx, sy - by);
  // Toward the stern along the boat, and "up" square to it (y grows downward in a picture).
  const d = length === 0 ? [1, 0] : [(sx - bx) / length, (sy - by) / length];
  const [dx = 1, dy = 0] = d;
  const up = -dx < 0 || (dx === 0 && dy > 0) ? [dy, -dx] : [-dy, dx];
  const [ux = 0, uy = -1] = up;
  const [hx, hy] = toPixels(hip, size);
  const [px, py] = toPixels(shoulder, size);
  const t = [px - hx, py - hy] as const;
  return (Math.atan2(t[0] * dx + t[1] * dy, t[0] * ux + t[1] * uy) * 180) / Math.PI;
}

/** The phase of a frame from the stroke marks; null when the frame no longer carries a mark. */
export function phaseOf(frame: number, summary: StrokeSummary): Phase | null {
  for (const s of summary.strokes) {
    if (frame === s.catch) return 'catch';
    if (frame === s.finish) return 'finish';
    if (frame === s.halfSlideDrive) return 'half_slide_drive';
    if (frame === s.halfSlideRecovery) return 'half_slide_recovery';
  }
  return null;
}

export interface AngleCell {
  mean: number;
  n: number;
  min: number;
  max: number;
  /** Frames the values come from, in video order. */
  frames: number[];
}

export interface JointTable {
  joint: Joint;
  rows: { rowerId: string; cells: Partial<Record<Phase, AngleCell>> }[];
  /** Highest minus lowest rower mean, where at least two rowers have a value. */
  crewRange: Partial<Record<Phase, number>>;
}

export interface AngleTables {
  tables: JointTable[];
  /** Measurements on frames whose mark was removed since: kept, but in no phase. */
  loose: AngleMeasure[];
  /** Measurements without a value (upper body without a boat line). */
  refused: { measure: AngleMeasure; reason: AngleRefusal }[];
}

/** Per joint (in JOINTS order) a row per rower (in `rowerOrder`, then any others), cells per phase. */
export function angleTables(
  measures: readonly AngleMeasure[],
  summary: StrokeSummary,
  size: Size,
  boatLines: readonly FrameBoatLine[],
  rowerOrder: readonly string[],
  auto: AutoBoatLines | null = null,
): AngleTables {
  const loose: AngleMeasure[] = [];
  const refused: AngleTables['refused'] = [];
  const values = new Map<string, { frame: number; degrees: number }[]>();
  for (const m of measures) {
    const phase = phaseOf(m.frame, summary);
    if (phase === null) {
      loose.push(m);
      continue;
    }
    const value = measureAt(m, size, boatLines, auto);
    if (!value.ok) {
      refused.push({ measure: m, reason: value.reason });
      continue;
    }
    const key = `${m.joint}|${m.rowerId}|${phase}`;
    values.set(key, [...(values.get(key) ?? []), { frame: m.frame, degrees: value.degrees }]);
  }

  const tables = JOINTS.flatMap((joint): JointTable[] => {
    const rowers = [
      ...new Set(measures.filter((m) => m.joint === joint).map((m) => m.rowerId)),
    ].sort((a, b) => order(rowerOrder, a) - order(rowerOrder, b));
    const rows = rowers
      .map((rowerId) => {
        const cells: Partial<Record<Phase, AngleCell>> = {};
        for (const phase of PHASES) {
          const list = values.get(`${joint}|${rowerId}|${phase}`);
          if (list === undefined || list.length === 0) continue;
          const degrees = list.map((v) => v.degrees);
          cells[phase] = {
            mean: degrees.reduce((sum, d) => sum + d, 0) / degrees.length,
            n: degrees.length,
            min: Math.min(...degrees),
            max: Math.max(...degrees),
            frames: list.map((v) => v.frame).sort((a, b) => a - b),
          };
        }
        return { rowerId, cells };
      })
      .filter((row) => Object.keys(row.cells).length > 0);
    if (rows.length === 0) return [];
    const crewRange: Partial<Record<Phase, number>> = {};
    for (const phase of PHASES) {
      const means = rows.flatMap((r) =>
        r.cells[phase] === undefined ? [] : [r.cells[phase].mean],
      );
      if (means.length >= 2) crewRange[phase] = Math.max(...means) - Math.min(...means);
    }
    return [{ joint, rows, crewRange }];
  });

  return { tables, loose, refused };
}

const order = (list: readonly string[], id: string) => {
  const at = list.indexOf(id);
  return at === -1 ? list.length : at;
};
