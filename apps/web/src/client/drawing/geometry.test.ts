import { describe, expect, it } from 'vitest';
import { angleArc, angleDegrees, toFraction, toPixels, dragPoint, isTap } from './geometry.ts';

const HD = { width: 1920, height: 1080 };
const SQUARE = { width: 1000, height: 1000 };

describe('angleDegrees', () => {
  it('measures right, straight, acute and zero angles', () => {
    expect(angleDegrees([1, 0.5], [0.5, 0.5], [0.5, 0], SQUARE)).toBeCloseTo(90);
    expect(angleDegrees([0, 0.5], [0.5, 0.5], [1, 0.5], SQUARE)).toBeCloseTo(180);
    expect(angleDegrees([1, 0.5], [0.5, 0.5], [1, 0], SQUARE)).toBeCloseTo(45);
    expect(angleDegrees([1, 0.5], [0.5, 0.5], [1, 0.5], SQUARE)).toBeCloseTo(0);
  });

  it('works in picture pixels: a fraction "square" on a 16:9 picture is not 45°', () => {
    // 0.5 right and 0.5 up: 960 px right, 540 px up → atan(540/960) ≈ 29.4°.
    expect(angleDegrees([1, 0.5], [0.5, 0.5], [1, 0], HD)).toBeCloseTo(29.36, 1);
  });

  it('is 0 for a degenerate arm instead of NaN', () => {
    expect(angleDegrees([0.5, 0.5], [0.5, 0.5], [1, 0], HD)).toBe(0);
  });
});

describe('point mapping', () => {
  it('converts between fractions and picture pixels', () => {
    expect(toPixels([0.25, 0.5], HD)).toEqual([480, 540]);
    expect(toFraction(480, 540, HD)).toEqual([0.25, 0.5]);
  });

  it('refuses points outside the picture (the black bars)', () => {
    expect(toFraction(-1, 10, HD)).toBeNull();
    expect(toFraction(10, 1081, HD)).toBeNull();
    expect(toFraction(1920, 1080, HD)).toEqual([1, 1]);
  });
});

describe('angleArc', () => {
  it('draws the shorter arc between the arms', () => {
    // Arms to the right (0 rad) and up (−π/2): sweep −π/2, so sweep flag 0.
    expect(angleArc([1, 0.5], [0.5, 0.5], [0.5, 0], SQUARE, 100)).toBe(
      'M 600 500 A 100 100 0 0 0 500 400',
    );
    expect(angleArc([0.5, 0], [0.5, 0.5], [1, 0.5], SQUARE, 100)).toBe(
      'M 500 400 A 100 100 0 0 1 600 500',
    );
  });
});

describe('touch drawing helpers', () => {
  const size = { width: 1000, height: 500 };
  it('moves a point by the pointer, slower with a finger, and keeps it on the picture', () => {
    expect(dragPoint([0.5, 0.5], 100, -50, size, 1)).toEqual([0.6, 0.4]);
    expect(dragPoint([0.5, 0.5], 100, -50, size, 0.5)).toEqual([0.55, 0.45]);
    expect(dragPoint([0.95, 0.02], 200, -100, size, 1)).toEqual([1, 0]);
  });

  it('counts a short, still press as a tap, not a swipe or a long press', () => {
    expect(isTap(3, 150)).toBe(true);
    expect(isTap(25, 150)).toBe(false);
    expect(isTap(2, 1500)).toBe(false);
  });
});
