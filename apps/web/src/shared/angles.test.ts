import { describe, expect, it } from 'vitest';
import {
  type AngleMeasure,
  angleTables,
  type BoatLine,
  boatLineAt,
  measureValue,
  measureAt,
  phaseOf,
  resolveBoatLine,
} from './angles.ts';
import type { Point } from './geometry.ts';
import { type StrokeMark, strokesFrom } from './strokes.ts';

const square = { width: 1000, height: 1000 };
const leftToRight: BoatLine = [
  [0.1, 0.5],
  [0.9, 0.5],
];

describe('measureValue', () => {
  it('gives the inner angle at the middle point of a joint', () => {
    const knee: Point[] = [
      [0.2, 0.2],
      [0.2, 0.5],
      [0.5, 0.5],
    ];
    const straight: Point[] = [
      [0.1, 0.5],
      [0.3, 0.5],
      [0.5, 0.5],
    ];
    expect(measureValue({ joint: 'knee', points: knee }, square, null)).toEqual({
      ok: true,
      degrees: 90,
    });
    const elbow = measureValue({ joint: 'elbow', points: straight }, square, null);
    expect(elbow.ok && elbow.degrees).toBeCloseTo(180, 6);
  });

  it('measures the upper body from the perpendicular to the boat line, forward positive', () => {
    // Hip below, shoulder up and toward the stern (right): leaning forward atan(50 / 200).
    const forward: Point[] = [
      [0.5, 0.6],
      [0.55, 0.4],
    ];
    const lean = measureValue({ joint: 'trunk', points: forward }, square, leftToRight);
    expect(lean.ok && lean.degrees).toBeCloseTo(14.04, 2);
    // The same picture with the bow on the right: the rower faces left, so that is leaning back.
    const rightToLeft: BoatLine = [leftToRight[1], leftToRight[0]];
    const back = measureValue({ joint: 'trunk', points: forward }, square, rightToLeft);
    expect(back.ok && back.degrees).toBeCloseTo(-14.04, 2);
    // Upright on a tilted camera: square to a boat line at 10° reads 0.
    const tilt = (10 * Math.PI) / 180;
    const tilted: BoatLine = [
      [0.5 - 0.3 * Math.cos(tilt), 0.5 - 0.3 * Math.sin(tilt)],
      [0.5 + 0.3 * Math.cos(tilt), 0.5 + 0.3 * Math.sin(tilt)],
    ];
    const upright: Point[] = [
      [0.5, 0.5],
      [0.5 + 0.2 * Math.sin(tilt), 0.5 - 0.2 * Math.cos(tilt)],
    ];
    const square0 = measureValue({ joint: 'trunk', points: upright }, square, tilted);
    expect(square0.ok && square0.degrees).toBeCloseTo(0, 4);
  });

  it('refuses the upper body without a boat line, and the wrong number of points', () => {
    expect(
      measureValue(
        {
          joint: 'trunk',
          points: [
            [0.5, 0.6],
            [0.5, 0.4],
          ],
        },
        square,
        null,
      ),
    ).toEqual({ ok: false, reason: 'no_boat_line' });
    expect(measureValue({ joint: 'knee', points: [[0.1, 0.1]] }, square, null)).toEqual({
      ok: false,
      reason: 'bad_points',
    });
  });
});

const c = (frame: number): StrokeMark => ({ frame, kind: 'catch' });
const f = (frame: number): StrokeMark => ({ frame, kind: 'finish' });
const h = (frame: number): StrokeMark => ({ frame, kind: 'half_slide' });
const summary = strokesFrom([c(0), h(10), f(20), h(40), c(60), f(80), c(120)], 30);

describe('phaseOf', () => {
  it('reads the phase from the stroke mark on the frame', () => {
    expect(phaseOf(0, summary)).toBe('catch');
    expect(phaseOf(10, summary)).toBe('half_slide_drive');
    expect(phaseOf(20, summary)).toBe('finish');
    expect(phaseOf(40, summary)).toBe('half_slide_recovery');
    expect(phaseOf(80, summary)).toBe('finish');
    expect(phaseOf(5, summary)).toBeNull();
  });
});

describe('angleTables', () => {
  const knee = (id: string, frame: number, rowerId: string, degrees: 90 | 120 | 180) => {
    const end: Point = degrees === 90 ? [0.5, 0.5] : degrees === 120 ? [0.4598, 0.65] : [0.2, 0.8];
    return {
      id,
      frame,
      rowerId,
      joint: 'knee' as const,
      points: [[0.2, 0.2] as Point, [0.2, 0.5] as Point, end],
    };
  };

  it('averages per rower and phase, with n, spread, frames and the crew difference', () => {
    const measures: AngleMeasure[] = [
      knee('1', 0, 'anna', 90),
      knee('2', 60, 'anna', 120),
      knee('3', 0, 'bram', 180),
      knee('4', 20, 'bram', 180),
    ];
    const { tables, loose, refused } = angleTables(measures, summary, square, [], ['bram', 'anna']);
    expect(loose).toEqual([]);
    expect(refused).toEqual([]);
    const [table] = tables;
    expect(table?.joint).toBe('knee');
    expect(table?.rows.map((r) => r.rowerId)).toEqual(['bram', 'anna']); // lineup order
    const anna = table?.rows[1]?.cells.catch;
    expect(anna?.n).toBe(2);
    expect(anna?.mean).toBeCloseTo(105, 0);
    expect(anna?.frames).toEqual([0, 60]);
    expect([anna?.min, anna?.max].map((d) => Math.round(d ?? 0))).toEqual([90, 120]);
    // Catch: Bram 180, Anna 105 → 75 apart. Finish: only Bram, no crew difference.
    expect(table?.crewRange.catch).toBeCloseTo(75, 0);
    expect(table?.crewRange.finish).toBeUndefined();
  });

  it('keeps measurements on frames without a mark apart, and says why a value is missing', () => {
    const measures: AngleMeasure[] = [
      knee('1', 5, 'anna', 90),
      {
        id: '2',
        frame: 0,
        rowerId: 'anna',
        joint: 'trunk',
        points: [
          [0.5, 0.6],
          [0.5, 0.4],
        ],
      },
    ];
    const result = angleTables(measures, summary, square, [], []);
    expect(result.tables).toEqual([]);
    expect(result.loose.map((m) => m.id)).toEqual(['1']);
    expect(result.refused).toEqual([{ measure: measures[1], reason: 'no_boat_line' }]);
  });
});

describe('boatLineAt', () => {
  const line = (frame: number) => ({ frame, points: leftToRight });
  it('takes the last line at or before the frame, else the first one', () => {
    const lines = [line(100), line(0), line(250)];
    expect(boatLineAt(0, lines)?.frame).toBe(0);
    expect(boatLineAt(99, lines)?.frame).toBe(0);
    expect(boatLineAt(100, lines)?.frame).toBe(100);
    expect(boatLineAt(400, lines)?.frame).toBe(250);
    expect(boatLineAt(5, [line(50)])?.frame).toBe(50); // before the first: the nearest one
    expect(boatLineAt(5, [])).toBeNull();
  });

  it('measures each upper body against the line that applies at its frame', () => {
    const trunk = (id: string, frame: number): AngleMeasure => ({
      id,
      frame,
      rowerId: 'anna',
      joint: 'trunk',
      points: [
        [0.5, 0.6],
        [0.55, 0.4],
      ],
    });
    const turned: BoatLine = [leftToRight[1], leftToRight[0]];
    const marks = strokesFrom([c(0), f(20), c(60), f(80)], 30);
    const { tables } = angleTables(
      [trunk('1', 0), trunk('2', 60)],
      marks,
      square,
      [
        { frame: 0, points: leftToRight },
        { frame: 50, points: turned },
      ],
      ['anna'],
    );
    // The same body leans forward against the first line and back against the turned one: the
    // mean of +14 and -14 is 0.
    expect(tables[0]?.rows[0]?.cells.catch?.mean).toBeCloseTo(0, 6);
    expect(tables[0]?.rows[0]?.cells.catch?.min).toBeCloseTo(-14.04, 2);
  });
});

describe('resolveBoatLine (ADR-0018)', () => {
  const coach = (frame: number, points: BoatLine = leftToRight) => ({ frame, points });
  const auto = (bowSide: 'left' | 'right' | null) => ({
    frames: [null, [0.2, 0.6, 0.8, 0.62, 0.9], null] as const,
    bowSide,
  });

  it("a coach's line on the frame wins; elsewhere the found line, else the coach's from before", () => {
    expect(resolveBoatLine(1, [coach(1)], auto(null))).toEqual({
      source: 'coach',
      frame: 1,
      points: leftToRight,
    });
    expect(resolveBoatLine(2, [coach(0)], auto(null))).toEqual({
      source: 'coach',
      frame: 0,
      points: leftToRight,
    });
    expect(resolveBoatLine(2, [], auto(null))).toBeNull();
  });

  it("takes the bow side from the nearest coach's line, else the coach's choice, else none", () => {
    const found = (r: ReturnType<typeof resolveBoatLine>) =>
      r?.source === 'auto' ? r.points : 'x';
    const turned: BoatLine = [leftToRight[1], leftToRight[0]];
    expect(found(resolveBoatLine(1, [coach(0)], auto('right')))).toEqual([
      [0.2, 0.6],
      [0.8, 0.62],
    ]);
    expect(found(resolveBoatLine(1, [coach(0, turned)], auto('left')))).toEqual([
      [0.8, 0.62],
      [0.2, 0.6],
    ]);
    expect(found(resolveBoatLine(1, [], auto('right')))).toEqual([
      [0.8, 0.62],
      [0.2, 0.6],
    ]);
    expect(found(resolveBoatLine(1, [], auto(null)))).toBeNull();
  });
});

describe('measureAt (ADR-0018)', () => {
  const trunk = {
    frame: 1,
    joint: 'trunk' as const,
    points: [
      [0.5, 0.6],
      [0.55, 0.4],
    ] as Point[],
  };
  const found = { frames: [null, [0.1, 0.5, 0.9, 0.5, 0.9]] as const, bowSide: null };

  it('measures the upper body against the line found on its frame, once the bow side is known', () => {
    expect(measureAt(trunk, square, [], found)).toEqual({ ok: false, reason: 'no_bow_side' });
    const lean = measureAt(trunk, square, [], { ...found, bowSide: 'left' });
    expect(lean.ok && lean.degrees).toBeCloseTo(14.04, 2);
    // Knees and elbows don't need a boat line at all.
    expect(
      measureAt(
        {
          ...trunk,
          joint: 'knee',
          points: [
            [0.2, 0.2],
            [0.2, 0.5],
            [0.5, 0.5],
          ],
        },
        square,
        [],
        found,
      ),
    ).toEqual({ ok: true, degrees: 90 });
  });
});
