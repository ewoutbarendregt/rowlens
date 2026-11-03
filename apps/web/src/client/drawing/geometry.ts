/**
 * Drawings on a frame (#60). Points are stored as fractions of the picture (0–1 from the left and
 * the top), so they stay put at any size; maths happens in picture pixels, because a 16:9 picture
 * isn't square in fractions.
 */
import { type Point, type Size, toPixels } from '../../shared/geometry.ts';
export type { Point, Size } from '../../shared/geometry.ts';
export { angleDegrees, toPixels } from '../../shared/geometry.ts';
export type DrawingKind = 'line' | 'arrow' | 'angle';

export const POINTS_NEEDED: Record<DrawingKind, number> = { line: 2, arrow: 2, angle: 3 };

/** A point in picture pixels as a fraction; `null` outside the picture (e.g. on the black bars). */
export function toFraction(x: number, y: number, size: Size): Point | null {
  if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
  return [round(x / size.width), round(y / size.height)];
}

/** SVG path of the arc that marks the angle at `vertex`, `radius` pixels out (the shorter way). */
export function angleArc(a: Point, vertex: Point, c: Point, size: Size, radius: number): string {
  const [vx, vy] = toPixels(vertex, size);
  const start = Math.atan2(toPixels(a, size)[1] - vy, toPixels(a, size)[0] - vx);
  const end = Math.atan2(toPixels(c, size)[1] - vy, toPixels(c, size)[0] - vx);
  let sweep = end - start;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  const p = (t: number) => `${fmt(vx + radius * Math.cos(t))} ${fmt(vy + radius * Math.sin(t))}`;
  return `M ${p(start)} A ${fmt(radius)} ${fmt(radius)} 0 0 ${sweep > 0 ? '1' : '0'} ${p(start + sweep)}`;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Moves a point by a pointer's movement (in picture pixels), scaled down by `factor` for fine
 * control with a finger, and kept on the picture (touch drawing, Ewout 2026-11-03).
 */
export function dragPoint(start: Point, dx: number, dy: number, size: Size, factor: number): Point {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    round(clamp(start[0] + (dx * factor) / size.width)),
    round(clamp(start[1] + (dy * factor) / size.height)),
  ];
}

/** A tap, not a swipe, scroll or long press: little movement (screen pixels) and quickly up. */
export function isTap(moved: number, millis: number): boolean {
  return moved <= TAP_SLOP && millis <= TAP_TIME;
}

export const TAP_SLOP = 10;
export const TAP_TIME = 700;
/** How close (screen pixels) a press must be to a point to pick it up: a fingertip. */
export const HANDLE_REACH = 28;
