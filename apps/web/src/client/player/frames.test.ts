import { describe, expect, it } from 'vitest';
import {
  clampFrame,
  formatFrameTime,
  presentedFrame,
  frameAfterSeconds,
  frameCount,
  frameToTime,
  loopJumpTarget,
  normalizeLoop,
  timeToFrame,
} from './frames.ts';

describe('timeToFrame / frameToTime', () => {
  it.each([24, 25, 30, 50, 60, 60000 / 1001, 120, 240])(
    'round-trips every frame of 10 s at %d fps',
    (fps) => {
      const count = frameCount(10, fps);
      for (let frame = 0; frame < count; frame++) {
        expect(timeToFrame(frameToTime(frame, fps), fps)).toBe(frame);
        // A frame's own presentation timestamp maps back to it as well (rVFC mediaTime).
        expect(timeToFrame(frame / fps, fps)).toBe(frame);
      }
    },
  );

  it('absorbs float error just below a frame boundary', () => {
    expect(timeToFrame(0.29999999, 60)).toBe(18);
    expect(timeToFrame(18 / 60 - 1e-9, 60)).toBe(18);
  });

  it('never returns a negative frame', () => {
    expect(timeToFrame(-0.5, 60)).toBe(0);
  });
});

describe('presentedFrame', () => {
  // Found in the spike: with WebM's 1 ms timestamps, flooring put frame 10 at 30 fps on frame 9.
  it.each([
    ['WebM (1 ms)', 1000],
    ['MP4 (1/15360 s)', 15360],
    ['MPEG-TS (1/90000 s)', 90000],
  ])('maps every frame start to its frame with %s timestamps', (_name, timescale) => {
    for (const fps of [24, 25, 30, 50, 60, 60000 / 1001, 120, 240]) {
      for (let frame = 0; frame < frameCount(10, fps); frame++) {
        const mediaTime = Math.round((frame / fps) * timescale) / timescale;
        expect(presentedFrame(mediaTime, fps)).toBe(frame);
      }
    }
  });

  it('never returns a negative frame', () => {
    expect(presentedFrame(-0.001, 30)).toBe(0);
  });
});

describe('frameCount and clampFrame', () => {
  it('counts frames from the duration', () => {
    expect(frameCount(10, 60)).toBe(600);
    expect(frameCount(9.9833, 60)).toBe(599);
    expect(frameCount(Number.NaN, 60)).toBe(1);
    expect(frameCount(0, 60)).toBe(1);
  });

  it('keeps frames inside the clip', () => {
    expect(clampFrame(-3, 600)).toBe(0);
    expect(clampFrame(600, 600)).toBe(599);
    expect(clampFrame(12.4, 600)).toBe(12);
  });
});

describe('frameAfterSeconds', () => {
  it('converts small seeks to whole frames', () => {
    expect(frameAfterSeconds(100, 0.1, 60)).toBe(106);
    expect(frameAfterSeconds(100, -0.1, 30)).toBe(97);
    expect(frameAfterSeconds(100, 1, 60000 / 1001)).toBe(160);
  });
});

describe('formatFrameTime', () => {
  it.each([
    [0, 60, '0:00.00'],
    [37, 60, '0:00.61'],
    [600, 60, '0:10.00'],
    [3661, 60, '1:01.01'],
  ])('frame %d at %d fps is %s', (frame, fps, expected) => {
    expect(formatFrameTime(frame, fps)).toBe(expected);
  });
});

describe('loops', () => {
  it('orders and clamps the range', () => {
    expect(normalizeLoop({ in: 40, out: 10 }, 600)).toEqual({ in: 10, out: 40 });
    expect(normalizeLoop({ in: 590, out: 700 }, 600)).toEqual({ in: 590, out: 599 });
  });

  it('rejects a loop shorter than two frames', () => {
    expect(normalizeLoop({ in: 10, out: 10 }, 600)).toBeNull();
  });

  it('jumps back to `in` once `out` has been shown, or from outside the range', () => {
    const loop = { in: 10, out: 20 };
    expect(loopJumpTarget(10, loop)).toBeNull();
    expect(loopJumpTarget(19, loop)).toBeNull();
    expect(loopJumpTarget(20, loop)).toBe(10);
    expect(loopJumpTarget(21, loop)).toBe(10);
    expect(loopJumpTarget(5, loop)).toBe(10);
    expect(loopJumpTarget(21, null)).toBeNull();
  });
});
