/**
 * Strokes from a coach's marks (#85, ADR-0016). A stroke runs from one catch to the next; between
 * them the finish, and optionally a half-slide mark on the drive (before the finish) and on the
 * recovery (after it). Frames are on the CFR rendition (ADR-0007), so time = frames / fps.
 *
 * Every value carries the frames it came from, or the reason it can't be given (ADR-0009): nothing
 * is estimated. Pure, so the worker can use the same rules for its evaluation set later.
 */
export const STROKE_MARK_KINDS = ['catch', 'half_slide', 'finish'] as const;
export type StrokeMarkKind = (typeof STROKE_MARK_KINDS)[number];

export interface StrokeMark {
  frame: number;
  kind: StrokeMarkKind;
}

/** Why a value isn't there. */
export type StrokeRefusal =
  /** The last catch has no next one, so no period and no recovery. */
  'last_stroke' | 'no_finish' | 'two_finishes';

export type Measured =
  { ok: true; value: number; evidence: readonly number[] } | { ok: false; reason: StrokeRefusal };

export interface Stroke {
  /** 1-based, in video order. */
  number: number;
  catch: number;
  nextCatch: number | null;
  finish: number | null;
  /** Half slide on the drive and on the recovery: only when the coach marked it. */
  halfSlideDrive: number | null;
  halfSlideRecovery: number | null;
  /**
   * The middle of the drive in time, halfway between catch and finish: a computed stand-in for the
   * half slide on the drive, shown only when the viewer turns it on (Ewout, 2026-11-03). Null
   * without a single finish. A marked half slide always wins.
   */
  driveMiddle: number | null;
  /** Strokes per minute, catch to catch. */
  rate: Measured;
  /** Seconds. */
  drive: Measured;
  recovery: Measured;
  /** Drive time / recovery time. */
  ratio: Measured;
}

export interface StrokeAverages {
  /** Complete strokes (catch, finish, next catch) the averages are over. */
  count: number;
  rate: number;
  /** Standard deviation of the rate, spm: how even the rhythm is. */
  rateSpread: number;
  drive: number;
  recovery: number;
  ratio: number;
}

export interface StrokeSummary {
  strokes: Stroke[];
  /** Averages from MIN_STROKES complete strokes on (perspective rules); otherwise null. */
  averages: StrokeAverages | null;
  /** Marks before the first catch: they belong to no stroke and are left out. */
  loose: number[];
}

/** As in `docs/analysis/perspective-rules.md`: rate and ratio need at least 3 strokes. */
export const MIN_STROKES = 3;

const refused = (reason: StrokeRefusal): Measured => ({ ok: false, reason });

export function strokesFrom(marks: readonly StrokeMark[], fps: number): StrokeSummary {
  const sorted = [...marks].sort((a, b) => a.frame - b.frame);
  const catches = sorted.filter((m) => m.kind === 'catch').map((m) => m.frame);
  const first = catches[0];
  const loose = sorted.filter((m) => first === undefined || m.frame < first).map((m) => m.frame);

  const strokes = catches.map((at, i): Stroke => {
    const next = catches[i + 1] ?? null;
    const inside = sorted.filter((m) => m.frame > at && (next === null || m.frame < next));
    const finishes = inside.filter((m) => m.kind === 'finish').map((m) => m.frame);
    const finish = finishes.length === 1 ? (finishes[0] ?? null) : null;
    const halves = inside.filter((m) => m.kind === 'half_slide').map((m) => m.frame);
    // Without a single finish, a half-slide mark can't be put on the drive or the recovery.
    const halfSlideDrive = finish === null ? null : (halves.find((f) => f < finish) ?? null);
    const halfSlideRecovery = finish === null ? null : (halves.find((f) => f > finish) ?? null);
    const finishProblem: StrokeRefusal | null =
      finishes.length === 0 ? 'no_finish' : finishes.length > 1 ? 'two_finishes' : null;

    const rate: Measured =
      next === null
        ? refused('last_stroke')
        : { ok: true, value: (60 * fps) / (next - at), evidence: [at, next] };
    const drive: Measured =
      finish === null
        ? refused(finishProblem ?? 'no_finish')
        : { ok: true, value: (finish - at) / fps, evidence: [at, finish] };
    const recovery: Measured =
      finish === null
        ? refused(finishProblem ?? 'no_finish')
        : next === null
          ? refused('last_stroke')
          : { ok: true, value: (next - finish) / fps, evidence: [finish, next] };
    const ratio: Measured =
      drive.ok && recovery.ok
        ? {
            ok: true,
            value: drive.value / recovery.value,
            evidence: [at, finish ?? at, next ?? at],
          }
        : drive.ok
          ? recovery
          : drive;

    return {
      number: i + 1,
      catch: at,
      nextCatch: next,
      finish,
      halfSlideDrive,
      halfSlideRecovery,
      driveMiddle: finish === null ? null : Math.round((at + finish) / 2),
      rate,
      drive,
      recovery,
      ratio,
    };
  });

  return { strokes, averages: averagesOf(strokes), loose };
}

function averagesOf(strokes: readonly Stroke[]): StrokeAverages | null {
  const complete = strokes.filter((s) => s.rate.ok && s.ratio.ok);
  if (complete.length < MIN_STROKES) return null;
  const values = (pick: (s: Stroke) => Measured) =>
    complete.map((s) => {
      const m = pick(s);
      return m.ok ? m.value : 0;
    });
  const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const rates = values((s) => s.rate);
  const rate = mean(rates);
  return {
    count: complete.length,
    rate,
    rateSpread: Math.sqrt(mean(rates.map((r) => (r - rate) ** 2))),
    drive: mean(values((s) => s.drive)),
    recovery: mean(values((s) => s.recovery)),
    ratio: mean(values((s) => s.ratio)),
  };
}

/** The catch before or after a frame, for ↑ / ↓; null at the ends. */
export function neighbourCatch(
  marks: readonly StrokeMark[],
  frame: number,
  direction: -1 | 1,
): number | null {
  const catches = marks
    .filter((m) => m.kind === 'catch')
    .map((m) => m.frame)
    .sort((a, b) => a - b);
  if (direction === 1) return catches.find((f) => f > frame) ?? null;
  return catches.filter((f) => f < frame).at(-1) ?? null;
}
