import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import { appUrl } from '../env.ts';
import { DrawingLayer } from '../drawing/DrawingLayer.tsx';
import { DrawTools } from '../drawing/DrawTools.tsx';
import type { DrawingKind, Point } from '../drawing/geometry.ts';
import { rememberedName, rememberName } from '../notes/name.ts';
import { type Annotation, describeDrawing, NotesPanel } from '../notes/NotesPanel.tsx';
import { notesStrings } from '../notes/strings.ts';
import { Player, type PlayerHandle } from '../player/Player.tsx';
import { formatVideoFacts, sessionStrings, type Perspective, type VideoStatus } from './strings.ts';

interface VideoDetail {
  id: string;
  sessionId: string;
  sessionTitle: string;
  filename: string;
  perspective: Perspective;
  status: VideoStatus;
  fpsNum: number | null;
  fpsDen: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  renditions: { name: string; width: number; height: number }[];
}

/** Narrow screens and saving/slow connections start on 540p (player spike, ADR-0007). */
function preferSmall(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  return (
    window.innerWidth < 900 ||
    connection?.saveData === true ||
    ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')
  );
}

/** One of the club's own videos in the frame-accurate player (#49, #52). */
export function VideoPage() {
  const t = sessionStrings();
  const { id = '' } = useParams();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [rendition, setRendition] = useState<string | null>(null);
  // The frame on screen: carried over when switching rendition, and where a new note goes.
  const frame = useRef(0);
  const [current, setCurrent] = useState(0);
  const player = useRef<PlayerHandle>(null);
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [name, setName] = useState(rememberedName);
  const [tool, setTool] = useState<DrawingKind | null>(null);

  const loadNotes = useCallback(() => {
    api(`/api/videos/${id}/annotations`)
      .then((res) => (res.ok ? (res.json() as Promise<{ annotations: Annotation[] }>) : null))
      .then((body) => {
        if (body !== null) setNotes(body.annotations);
      })
      .catch(() => {
        // The player still works; the panel shows what it has.
      });
  }, [id]);
  useEffect(loadNotes, [loadNotes]);

  // The picture's display size (after rotation): the drawings' coordinate system.
  const size = useMemo(
    () =>
      video?.width != null && video.height != null
        ? { width: video.width, height: video.height }
        : { width: 1920, height: 1080 },
    [video?.width, video?.height],
  );

  const markers = useMemo(() => {
    const nt = notesStrings();
    return notes.map((n) => ({
      id: n.id,
      frame: n.frame,
      label:
        n.kind === 'note'
          ? nt.marker(n.frame, n.body.length > 80 ? `${n.body.slice(0, 80)}…` : n.body)
          : nt.drawingMarker(n.frame, describeDrawing(n, size)),
    }));
  }, [notes, size]);

  // Drawings show on exactly their frame (#60).
  const drawingsHere = useMemo(
    () =>
      notes
        .filter((n) => n.kind !== 'note' && n.frame === current && n.shape !== null)
        .map((n) => ({ id: n.id, kind: n.kind as DrawingKind, points: n.shape?.points ?? [] })),
    [notes, current],
  );

  const chooseTool = useCallback((next: DrawingKind | null) => {
    if (next !== null) {
      player.current?.pause();
      // On a phone the picture may be scrolled away; drawing happens on it.
      const stage = document.querySelector('.player__stage');
      const box = stage?.getBoundingClientRect();
      if (box !== undefined && (box.top < 0 || box.bottom > window.innerHeight)) {
        stage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    setTool(next);
  }, []);
  const cancelTool = useCallback(() => {
    setTool(null);
  }, []);

  const saveDrawing = useCallback(
    (kind: DrawingKind, points: Point[]) => {
      rememberName(name.trim());
      void api(`/api/videos/${id}/annotations`, {
        method: 'POST',
        body: { kind, frame: frame.current, points, authorName: name },
      }).finally(loadNotes);
    },
    [id, name, loadNotes],
  );

  useEffect(() => {
    api(`/api/videos/${id}`)
      .then((res) => (res.ok ? (res.json() as Promise<VideoDetail>) : Promise.reject(new Error())))
      .then((v) => {
        setVideo(v);
        const names = v.renditions.map((r) => r.name);
        const small = names.includes('play-540') ? 'play-540' : (names[0] ?? null);
        setRendition(preferSmall() ? small : names.includes('play-1080') ? 'play-1080' : small);
      })
      .catch(() => {
        setFailed(true);
      });
  }, [id]);

  if (failed) {
    return (
      <main className="page">
        <p role="alert">{t.loadFailed}</p>
        <Link to="/sessions">{t.back}</Link>
      </main>
    );
  }
  if (video === null) return null;

  const media = (name: string) => appUrl(`/api/videos/${video.id}/media/${name}`);
  // Display shape from the worker's metadata, known before the video loads: portrait phone video
  // gets its own laptop layout (video beside its controls).
  const aspect =
    video.width !== null && video.height !== null ? video.width / video.height : 16 / 9;
  const portrait = aspect < 0.9;
  const ready = video.status === 'ready' && rendition !== null && video.fpsNum !== null;

  return (
    <main className="page page--wide video-page">
      <header className="video-head">
        <nav className="page__nav">
          <Link to={`/sessions/${video.sessionId}`}>← {t.backToSession(video.sessionTitle)}</Link>
        </nav>
        <h1 className="video-title">{video.filename}</h1>
        <p className="muted video-facts">
          {t.perspectives[video.perspective]}
          {video.status === 'ready' && <> · {formatVideoFacts(video)}</>}
        </p>
      </header>

      {!ready && <p role="status">{t.notReady}</p>}
      {ready && video.fpsNum !== null && video.fpsDen !== null && (
        // Laptop: player (sticky) left, notes right, all in one view. Phone: stacked.
        <div
          className={`video-layout${portrait ? ' video-layout--portrait' : ''}`}
          style={{ '--aspect': String(aspect) } as CSSProperties}
        >
          <div className="video-layout__player">
            <Player
              key={rendition}
              src={media(rendition)}
              poster={media('poster')}
              fps={video.fpsNum / video.fpsDen}
              startFrame={frame.current}
              onFrame={(f) => {
                frame.current = f;
                setCurrent(f);
              }}
              markers={markers}
              handle={player}
              overlay={
                <DrawingLayer
                  size={size}
                  drawings={drawingsHere}
                  tool={tool}
                  onComplete={saveDrawing}
                  onCancel={cancelTool}
                />
              }
              toolbar={
                <>
                  <DrawTools tool={tool} named={name.trim() !== ''} onTool={chooseTool} />
                  {video.renditions.length > 1 && (
                    <div
                      className="quality"
                      role="group"
                      aria-label={t.quality}
                      title={t.qualityHint}
                    >
                      <span>{t.quality}</span>
                      {video.renditions
                        .map((r) => r.name)
                        .sort()
                        .reverse()
                        .map((name) => (
                          <button
                            key={name}
                            type="button"
                            className="button--quiet"
                            aria-pressed={rendition === name}
                            onClick={() => {
                              setRendition(name);
                            }}
                          >
                            {name.replace('play-', '')}p
                          </button>
                        ))}
                    </div>
                  )}
                </>
              }
            />
          </div>
          <aside className="video-layout__side">
            <NotesPanel
              videoId={video.id}
              fps={video.fpsNum / video.fpsDen}
              frame={current}
              size={size}
              annotations={notes}
              name={name}
              onNameChange={setName}
              onChanged={loadNotes}
              onJump={(f) => {
                player.current?.seekToFrame(f);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onWriting={() => {
                player.current?.pause();
              }}
            />
          </aside>
        </div>
      )}
    </main>
  );
}
