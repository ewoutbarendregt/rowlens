/** The part of an annotation the list groups by. */
export interface FrameItem {
  frame: number;
  kind: string;
}

export interface Moment<T extends FrameItem> {
  frame: number;
  notes: T[];
  drawings: T[];
}

/**
 * One entry per frame (Ewout: several drawings on a frame are one moment, with its explanation):
 * the frame's notes and drawings, in frame order, each in the order they came.
 */
export function moments<T extends FrameItem>(annotations: readonly T[]): Moment<T>[] {
  const byFrame = new Map<number, Moment<T>>();
  for (const a of annotations) {
    const m = byFrame.get(a.frame) ?? { frame: a.frame, notes: [], drawings: [] };
    (a.kind === 'note' ? m.notes : m.drawings).push(a);
    byFrame.set(a.frame, m);
  }
  return [...byFrame.values()].sort((x, y) => x.frame - y.frame);
}
