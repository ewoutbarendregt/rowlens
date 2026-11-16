import {
  resolveBoatLine,
  type AngleMeasure,
  type FrameBoatLine,
  type AutoBoatLines,
} from '../../shared/angles.ts';
import type { Drawing } from '../drawing/DrawingLayer.tsx';
import type { OverlayAnnotation } from '../notes/overlay.ts';

/** Public example projection has no author identity, timestamps or recipient metadata. */
export type ExampleAnnotation = Omit<OverlayAnnotation, 'authorName'> & { canEdit: false };

/** Reuse normal-player frame semantics: drawings/measurements are exact, boat lines persist. */
export function exampleDrawings(
  frame: number,
  annotations: readonly ExampleAnnotation[],
  measures: readonly AngleMeasure[],
  boatLines: readonly FrameBoatLine[],
  auto: AutoBoatLines | null,
): Drawing[] {
  const drawings: Drawing[] = annotations
    .filter((a) => a.frame === frame && a.kind !== 'note' && a.shape !== null)
    .map((a) => ({
      id: a.id,
      kind: a.kind as Drawing['kind'],
      points: a.shape?.points ?? [],
      frame,
      editable: false,
      deletable: false,
    }));
  for (const m of measures.filter((m) => m.frame === frame))
    drawings.push({
      id: `measure-${m.id}`,
      kind: m.joint === 'trunk' ? 'line' : 'angle',
      points: m.points,
      variant: 'measure',
      frame,
      editable: false,
      deletable: false,
    });
  const line = resolveBoatLine(frame, boatLines, auto);
  if (line)
    drawings.push({
      id: 'boat-line',
      kind: 'line',
      points: line.source === 'coach' ? line.points : (line.points ?? line.ends),
      variant: line.source === 'coach' ? 'boat' : 'auto',
      frame: line.frame,
      editable: false,
      deletable: false,
    });
  return drawings;
}
