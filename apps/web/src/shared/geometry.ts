/**
 * Picture geometry shared by the drawings (#60) and the angle measurements (ADR-0017). Points are
 * fractions of the picture (0–1 from the left and the top), so they stay put at any size; maths
 * happens in picture pixels, because a 16:9 picture isn't square in fractions.
 */
export type Point = readonly [number, number];

export interface Size {
  width: number;
  height: number;
}

export function toPixels([x, y]: Point, size: Size): [number, number] {
  return [x * size.width, y * size.height];
}

/** The angle at `vertex` between the arms to `a` and `c`, in degrees (0–180), in picture pixels. */
export function angleDegrees(a: Point, vertex: Point, c: Point, size: Size): number {
  const [ax, ay] = toPixels(a, size);
  const [vx, vy] = toPixels(vertex, size);
  const [cx, cy] = toPixels(c, size);
  const u = [ax - vx, ay - vy] as const;
  const w = [cx - vx, cy - vy] as const;
  const lengths = Math.hypot(...u) * Math.hypot(...w);
  if (lengths === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (u[0] * w[0] + u[1] * w[1]) / lengths));
  return (Math.acos(cos) * 180) / Math.PI;
}
