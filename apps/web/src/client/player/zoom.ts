import { createContext } from 'react';

/**
 * Zooming into the picture (Ewout, 2026-11-03): a scale and the picture point at the centre of the
 * stage, as fractions of the picture (0–1). The video and the drawing layer both follow it, so
 * drawings and angle measurements stay on the picture; the controls around the stage don't move.
 */
export interface View {
  scale: number;
  cx: number;
  cy: number;
}

export const NO_ZOOM: View = { scale: 1, cx: 0.5, cy: 0.5 };
export const MAX_ZOOM = 6;
/** One step of + / − or a wheel notch. */
export const ZOOM_STEP = 1.5;

/** Keeps the scale in 1…MAX_ZOOM and the centre where the visible part stays on the picture. */
export function clampView(view: View): View {
  const scale = Math.min(MAX_ZOOM, Math.max(1, view.scale));
  const half = 1 / (2 * scale);
  const clamp = (v: number) => Math.min(1 - half, Math.max(half, v));
  return { scale, cx: clamp(view.cx), cy: clamp(view.cy) };
}

/**
 * Zooms by `factor` keeping the picture point `p` (fractions) where it is on screen: the point
 * under the cursor or between two fingers stays put.
 */
export function zoomAt(view: View, factor: number, p: { x: number; y: number }): View {
  const scale = Math.min(MAX_ZOOM, Math.max(1, view.scale * factor));
  // Screen offset of p from the centre, in picture fractions at scale 1: (p − c) · s stays equal.
  return clampView({
    scale,
    cx: p.x - ((p.x - view.cx) * view.scale) / scale,
    cy: p.y - ((p.y - view.cy) * view.scale) / scale,
  });
}

/** Moves the picture with a drag: `dx`, `dy` in fractions of the displayed picture's size. */
export function panBy(view: View, dx: number, dy: number): View {
  return clampView({ ...view, cx: view.cx - dx / view.scale, cy: view.cy - dy / view.scale });
}

/** The picture point (fractions) under a point of the displayed, unzoomed picture (fractions). */
export function pictureAt(view: View, fx: number, fy: number): { x: number; y: number } {
  return { x: view.cx + (fx - 0.5) / view.scale, y: view.cy + (fy - 0.5) / view.scale };
}

/** The drawing layer's viewBox for a view: the visible part of the picture, in picture pixels. */
export function viewBoxOf(view: View, size: { width: number; height: number }): string {
  const w = size.width / view.scale;
  const h = size.height / view.scale;
  return `${String(view.cx * size.width - w / 2)} ${String(view.cy * size.height - h / 2)} ${String(w)} ${String(h)}`;
}

/** Shared with the drawing layer, which lives in the page's overlay inside the stage. */
export const ViewContext = createContext<View>(NO_ZOOM);
