import { describe, expect, it } from 'vitest';
import { clampView, NO_ZOOM, panBy, pictureAt, viewBoxOf, zoomAt } from './zoom.ts';

describe('zoom', () => {
  it('keeps the scale between 1 and 6 and the visible part on the picture', () => {
    expect(clampView({ scale: 0.5, cx: 0.1, cy: 0.9 })).toEqual(NO_ZOOM);
    expect(clampView({ scale: 2, cx: 0.1, cy: 0.9 })).toEqual({ scale: 2, cx: 0.25, cy: 0.75 });
    expect(clampView({ scale: 10, cx: 0.5, cy: 0.5 }).scale).toBe(6);
  });

  it('zooms around a point that stays under the cursor', () => {
    const zoomed = zoomAt(NO_ZOOM, 2, { x: 0.4, y: 0.6 });
    expect(zoomed.scale).toBe(2);
    // The point was 0.1 left and 0.1 below the centre on screen; at 2× it still is.
    expect((0.4 - zoomed.cx) * zoomed.scale).toBeCloseTo(0.4 - 0.5, 10);
    expect((0.6 - zoomed.cy) * zoomed.scale).toBeCloseTo(0.6 - 0.5, 10);
    expect(zoomAt(zoomed, 1 / 4, { x: 0.4, y: 0.6 })).toEqual(NO_ZOOM);
  });

  it('pans with a drag and maps screen points back to the picture', () => {
    const two = { scale: 2, cx: 0.5, cy: 0.5 };
    // Dragging the picture right by a quarter of its width shows what was left of the centre.
    expect(panBy(two, 0.25, 0)).toEqual({ scale: 2, cx: 0.375, cy: 0.5 });
    expect(pictureAt(two, 1, 0)).toEqual({ x: 0.75, y: 0.25 });
    expect(pictureAt(NO_ZOOM, 0.3, 0.7)).toEqual({ x: 0.3, y: 0.7 });
  });

  it('gives the visible part as a viewBox in picture pixels', () => {
    expect(viewBoxOf(NO_ZOOM, { width: 1920, height: 1080 })).toBe('0 0 1920 1080');
    expect(viewBoxOf({ scale: 2, cx: 0.25, cy: 0.75 }, { width: 1920, height: 1080 })).toBe(
      '0 540 960 540',
    );
  });
});
