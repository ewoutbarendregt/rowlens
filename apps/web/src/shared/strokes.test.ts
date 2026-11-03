import { describe, expect, it } from 'vitest';
import { neighbourCatch, type StrokeMark, strokesFrom } from './strokes.ts';

const c = (frame: number): StrokeMark => ({ frame, kind: 'catch' });
const f = (frame: number): StrokeMark => ({ frame, kind: 'finish' });
const h = (frame: number): StrokeMark => ({ frame, kind: 'half_slide' });

/** Catch every 60 frames at 30 fps (30 spm), finish 20 frames later: drive 0.67 s, recovery 1.33 s. */
const regular = (n: number, start = 10) =>
  Array.from({ length: n }, (_, i) => [c(start + i * 60), f(start + i * 60 + 20)]).flat();

describe('strokesFrom', () => {
  it('gives rate, drive, recovery and ratio per stroke, with the frames they came from', () => {
    const { strokes } = strokesFrom(regular(2), 30);
    const [first] = strokes;
    expect(first?.rate).toEqual({ ok: true, value: 30, evidence: [10, 70] });
    expect(first?.drive).toMatchObject({ ok: true, evidence: [10, 30] });
    expect(first?.drive.ok && first.drive.value).toBeCloseTo(0.667, 3);
    expect(first?.recovery.ok && first.recovery.value).toBeCloseTo(1.333, 3);
    expect(first?.ratio.ok && first.ratio.value).toBeCloseTo(0.5, 6);
  });

  it('refuses rate and recovery for the last stroke, and averages below three strokes', () => {
    const summary = strokesFrom(regular(3), 30);
    expect(summary.strokes).toHaveLength(3);
    expect(summary.strokes[2]?.rate).toEqual({ ok: false, reason: 'last_stroke' });
    expect(summary.strokes[2]?.drive.ok).toBe(true);
    expect(summary.strokes[2]?.recovery).toEqual({ ok: false, reason: 'last_stroke' });
    // Three catches make two complete strokes: not enough for averages.
    expect(summary.averages).toBeNull();
  });

  it('averages complete strokes from three on, with the spread of the rate', () => {
    const marks = [c(0), f(20), c(60), f(80), c(120), f(140), c(200)];
    const { averages } = strokesFrom(marks, 30);
    expect(averages?.count).toBe(3);
    // Periods 60, 60, 80 frames → 30, 30, 22.5 spm.
    expect(averages?.rate).toBeCloseTo(27.5, 6);
    expect(averages?.rateSpread).toBeCloseTo(3.536, 3);
  });

  it('says why when a finish is missing or doubled, instead of guessing', () => {
    const missing = strokesFrom([c(0), c(60), f(80), c(120)], 30).strokes[0];
    expect(missing?.drive).toEqual({ ok: false, reason: 'no_finish' });
    expect(missing?.ratio).toEqual({ ok: false, reason: 'no_finish' });
    expect(missing?.rate.ok).toBe(true);
    const doubled = strokesFrom([c(0), f(20), f(25), c(60)], 30).strokes[0];
    expect(doubled?.finish).toBeNull();
    expect(doubled?.drive).toEqual({ ok: false, reason: 'two_finishes' });
  });

  it('puts a half slide on the drive or the recovery, only where it was marked', () => {
    const [stroke] = strokesFrom([c(0), h(8), f(20), h(45), c(60)], 30).strokes;
    expect(stroke?.halfSlideDrive).toBe(8);
    expect(stroke?.halfSlideRecovery).toBe(45);
    const [plain] = strokesFrom([c(0), f(20), c(60)], 30).strokes;
    expect(plain?.halfSlideDrive).toBeNull();
    expect(plain?.halfSlideRecovery).toBeNull();
  });

  it('computes the middle of the drive, halfway between catch and finish', () => {
    const [even, odd, open] = strokesFrom([c(0), f(20), c(60), f(75), c(120)], 30).strokes;
    expect(even?.driveMiddle).toBe(10);
    expect(odd?.driveMiddle).toBe(68); // 67.5 rounds to the nearer later frame
    expect(open?.driveMiddle).toBeNull(); // no finish, no middle
    expect(strokesFrom([c(0), f(20), f(25), c(60)], 30).strokes[0]?.driveMiddle).toBeNull();
  });

  it('handles fractional frame rates and leaves marks before the first catch out', () => {
    const summary = strokesFrom([f(3), c(10), f(30), c(70)], 30000 / 1001);
    expect(summary.loose).toEqual([3]);
    expect(summary.strokes[0]?.rate.ok && summary.strokes[0].rate.value).toBeCloseTo(29.97, 2);
    expect(strokesFrom([], 50)).toEqual({ strokes: [], averages: null, loose: [] });
    expect(strokesFrom([f(5)], 50).loose).toEqual([5]);
  });

  it('sorts marks first', () => {
    const shuffled = [f(80), c(60), f(20), c(0), c(120)];
    expect(strokesFrom(shuffled, 30).strokes.map((s) => [s.catch, s.finish])).toEqual([
      [0, 20],
      [60, 80],
      [120, null],
    ]);
  });
});

describe('neighbourCatch', () => {
  const marks = [c(10), f(30), c(70), c(130)];
  it('finds the catch before or after a frame', () => {
    expect(neighbourCatch(marks, 70, 1)).toBe(130);
    expect(neighbourCatch(marks, 70, -1)).toBe(10);
    expect(neighbourCatch(marks, 50, -1)).toBe(10);
    expect(neighbourCatch(marks, 130, 1)).toBeNull();
    expect(neighbourCatch(marks, 10, -1)).toBeNull();
  });
});
