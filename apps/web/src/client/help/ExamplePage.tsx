import { originalTrainingUrl } from './example-links.ts';
import { angleStrings } from '../angles/strings.ts';
import { useAuth } from '../auth/useAuth.ts';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import { appUrl } from '../env.ts';
import { Player, type PlayerHandle } from '../player/Player.tsx';
import { StrokesPanel } from '../strokes/StrokesPanel.tsx';
import { AnglesPanel, type AutoBoatLineState } from '../angles/AnglesPanel.tsx';
import {
  angleTables,
  phaseOf,
  type AngleMeasure,
  type FrameBoatLine,
} from '../../shared/angles.ts';
import { strokesFrom, type StrokeMark } from '../../shared/strokes.ts';
import { strokeStrings } from '../strokes/strings.ts';
import { sessionStrings, type Perspective } from '../sessions/strings.ts';
import { lineupStrings } from '../lineup/strings.ts';
import { helpStrings } from './strings.ts';
import { exampleDrawings, type ExampleAnnotation } from './example-feedback.ts';
import { DrawingLayer } from '../drawing/DrawingLayer.tsx';
import { activeVideoMoment, videoMoments } from '../notes/overlay.ts';
import { VideoNotesOverlay } from '../notes/VideoNotesOverlay.tsx';
import { notesStrings } from '../notes/strings.ts';
import { formatFrameTime } from '../player/frames.ts';
interface Clip {
  id: string;
  seq: number | null;
  status: string;
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
interface Example {
  clubId: string;
  id: string;
  title: string;
  lineup: { seat: number; rower: { id: string; displayName: string } }[];
  videos: Clip[];
}
const noop = () => undefined;
export function ExamplePage() {
  const { id = '' } = useParams();
  const t = helpStrings();
  const nt = notesStrings();
  const { state: auth } = useAuth();
  const st = strokeStrings();
  const [data, setData] = useState<Example | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [middle, setMiddle] = useState(false);
  const player = useRef<PlayerHandle>(null);
  const playerArea = useRef<HTMLDivElement>(null);
  const actor = auth.kind === 'open' ? auth.user.id : null;
  useEffect(() => {
    let stale = false;
    setData(null);
    setFailed(false);
    setChosen(null);
    setFrame(0);
    void api(`/api/examples/${id}`, { clubId: null })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const result = (await r.json()) as Example;
        if (!stale) setData(result);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [id, actor]);
  const ready = data?.videos.filter((v) => v.status === 'ready' && v.renditions.length > 0) ?? [];
  const v = ready.find((v) => v.id === chosen) ?? ready[0];
  const fps = v?.fpsNum && v.fpsDen ? v.fpsNum / v.fpsDen : 30;
  const size = { width: v?.width ?? 1, height: v?.height ?? 1 };
  const summary = strokesFrom(v?.marks ?? [], fps);
  const phase = phaseOf(frame, summary);
  const computed = middle
    ? summary.strokes.flatMap((s) =>
        s.driveMiddle === null || s.halfSlideDrive !== null
          ? []
          : [
              {
                frame: s.driveMiddle,
                kind: 'drive_middle' as const,
                label: st.markLabel(st.driveMiddle, s.number, s.driveMiddle),
              },
            ],
      )
    : [];
  const jump = (f: number) => {
    // WebKit may defer paused-frame presentation while the video is outside the viewport.
    // Bring the picture back before seeking from the notes/analysis panels below it.
    playerArea.current
      ?.querySelector('.player__stage')
      ?.scrollIntoView({ block: 'center', behavior: 'instant' });
    player.current?.seekToFrame(f);
  };
  const moments = videoMoments(
    (v?.annotations ?? []).map((a) => ({ ...a, authorName: t.exampleExplanation })),
    null,
  );
  const active = activeVideoMoment(moments, frame, fps);
  const drawings = v
    ? exampleDrawings(frame, v.annotations ?? [], v.measures, v.boatLines, v.auto)
    : [];
  return (
    <main className="page page--wide example-viewer">
      <p>
        <Link to="/sessions">{sessionStrings().sessions}</Link> · <Link to="/help">{t.help}</Link>
      </p>
      <h1>{data?.title ?? t.example}</h1>
      <p className="callout">{t.readOnly}</p>
      {data &&
        auth.kind === 'open' &&
        (auth.user.platformAdmin ||
          auth.clubs?.some(
            (c) => c.id === data.clubId && c.roles.some((r) => r === 'admin' || r === 'coach'),
          )) && (
          <p>
            <a href={originalTrainingUrl(data.id, data.clubId)}>{t.manageOriginal}</a>
          </p>
        )}
      {failed && <p role="alert">{sessionStrings().loadFailed}</p>}
      {data && ready.length === 0 && <p>{t.noVideo}</p>}
      {v && (
        <>
          <label>
            {sessionStrings().columns.videos}
            <select
              value={v.id}
              onChange={(e) => {
                setChosen(e.target.value);
                setFrame(0);
              }}
            >
              {ready.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {t.video(c.seq ?? i + 1)}
                </option>
              ))}
            </select>
          </label>
          <div ref={playerArea}>
            <Player
              key={v.id}
              src={appUrl(
                `/api/examples/${id}/videos/${v.id}/media/${v.renditions.includes('play-540') ? 'play-540' : (v.renditions[0] ?? 'play-540')}`,
                null,
              )}
              poster={appUrl(`/api/examples/${id}/videos/${v.id}/media/poster`, null)}
              fps={fps}
              onFrame={setFrame}
              handle={player}
              markers={moments.map((m) => ({
                id: String(m.frame),
                frame: m.frame,
                label: nt.marker(
                  m.frame,
                  [
                    ...m.drawings.map((d) => nt.tools[d.kind as keyof typeof nt.tools]),
                    ...m.notes.map((n) => n.body.slice(0, 80)),
                  ].join(' · '),
                ),
              }))}
              overlay={
                <>
                  <DrawingLayer
                    size={size}
                    drawings={drawings}
                    tool={null}
                    onComplete={() => Promise.resolve(false)}
                    onDelete={() => Promise.resolve(false)}
                    onCancel={noop}
                    onMove={noop}
                    controlsTarget={null}
                  />
                  {active && <VideoNotesOverlay moment={active} />}
                </>
              }
              strokeMarks={[
                ...v.marks.map((m) => ({
                  ...m,
                  label: st.markLabel(st.kinds[m.kind], null, m.frame),
                })),
                ...computed,
              ].sort((a, b) => a.frame - b.frame)}
            />
          </div>
          <section className="card example-notes" data-testid="example-notes">
            <h2>{nt.notes}</h2>
            {moments.length === 0 && <p className="muted">{nt.noneReadOnly}</p>}
            <ol>
              {moments.map((m) => (
                <li key={m.frame}>
                  <button
                    type="button"
                    className="button--quiet"
                    onClick={() => {
                      jump(m.frame);
                    }}
                  >
                    {nt.atFrame(m.frame, formatFrameTime(m.frame, fps))}
                  </button>
                  {m.drawings.map((d) => (
                    <p key={d.id}>
                      {nt.tools[d.kind as keyof typeof nt.tools]}
                      {d.body && <> · {d.body}</>}
                    </p>
                  ))}
                  {m.notes.map((n) => (
                    <p key={n.id}>{n.body}</p>
                  ))}
                </li>
              ))}
            </ol>
          </section>
          <h2>{st.strokes}</h2>
          <StrokesPanel
            summary={summary}
            marks={v.marks}
            fps={fps}
            frame={frame}
            canMark={false}
            busy={false}
            failed={false}
            onMark={noop}
            onRemove={noop}
            onJump={jump}
            onLoop={(a, b) => player.current?.setLoop(a, b)}
            driveMiddle={middle}
            onDriveMiddleChange={setMiddle}
          />
          <h2>{angleStrings().angles}</h2>
          <AnglesPanel
            tables={angleTables(
              v.measures,
              summary,
              size,
              v.boatLines,
              (data?.lineup ?? []).map((s) => s.rower.id),
              v.auto,
            )}
            measures={v.measures}
            boatLines={v.boatLines}
            auto={v.auto}
            fps={fps}
            size={size}
            rowers={(data?.lineup ?? []).map((s) => ({
              id: s.rower.id,
              name: s.rower.displayName,
              label: lineupStrings().seatLabel(s.seat === 0 ? 'cox' : 'middle', s.seat),
            }))}
            here={phase === null ? null : { phase, stroke: null }}
            frame={frame}
            canMeasure={false}
            notFromTheSide={v.perspective !== 'bank'}
            measuring={null}
            busy={false}
            failed={false}
            onMeasure={noop}
            onDelete={noop}
            onRemoveBoatLine={noop}
            onBowSide={noop}
            onJump={jump}
          />
        </>
      )}
    </main>
  );
}
