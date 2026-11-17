import type { AutoBoatLineState } from '../angles/AnglesPanel.tsx';
import type { AngleMeasure, FrameBoatLine } from '../../shared/angles.ts';
import type { StrokeMark } from '../../shared/strokes.ts';
import type { BoatClass } from '../../shared/boats.ts';
import type { LineupSeat } from '../lineup/LineupCard.tsx';
import type { Perspective, VideoStatus } from '../sessions/strings.ts';
import type { ExampleAnnotation } from './example-feedback.ts';
import { api } from '../api.ts';
import { appUrl } from '../env.ts';

/**
 * One example as `/api/examples/:id` returns it (ADR-0028's safe projection). The normal training
 * and video pages show it read-only from this one read, without calling any club API.
 */
export interface ExampleVideo {
  id: string;
  seq: number | null;
  /** Older server images omit the length. No recording time: the projection has no timestamps. */
  durationMs?: number | null;
  status: VideoStatus;
  fpsNum: number | null;
  fpsDen: number | null;
  width: number | null;
  height: number | null;
  perspective: Perspective;
  renditions: string[];
  marks: StrokeMark[];
  measures: AngleMeasure[];
  boatLines: FrameBoatLine[];
  auto: AutoBoatLineState | null;
  /** Older server images omit feedback; keep a rolling rollback readable. */
  annotations?: ExampleAnnotation[];
}

export interface ExampleDetail {
  id: string;
  clubId: string;
  title: string;
  date: string;
  boatType: BoatClass | null;
  lineup: LineupSeat[];
  videos: ExampleVideo[];
}

export async function loadExample(id: string): Promise<ExampleDetail> {
  const r = await api(`/api/examples/${id}`, { clubId: null });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as ExampleDetail;
}

/** Only finished videos with a playable rendition are part of the example. */
export const playable = (v: ExampleVideo) => v.status === 'ready' && v.renditions.length > 0;

/** Example media is authorized through the example, never through the viewer's active club. */
export const exampleMedia = (sessionId: string, videoId: string, name: string) =>
  appUrl(`/api/examples/${sessionId}/videos/${videoId}/media/${name}`, null);
