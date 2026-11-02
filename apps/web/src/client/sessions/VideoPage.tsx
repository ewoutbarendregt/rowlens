import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { appUrl } from '../env.ts';
import { DrawingLayer } from '../drawing/DrawingLayer.tsx';
import { DrawTools } from '../drawing/DrawTools.tsx';
import { LineupSummary, type LineupSeat } from '../lineup/LineupCard.tsx';
import type { DrawingKind, Point } from '../drawing/geometry.ts';
import { lineupStrings } from '../lineup/strings.ts';
import {
  framesFor,
  lineupSuggestions,
  type MomentRowers,
  type MomentShares,
  rowersWithNotes,
} from '../notes/assignees.ts';
import { type Annotation, describeDrawing, NotesPanel } from '../notes/NotesPanel.tsx';
import {
  activeVideoMoment,
  NOTE_HOLD_OPTIONS,
  type NoteHoldSeconds,
  rememberNoteHoldSeconds,
  rememberNotesVisible,
  storedNoteHoldSeconds,
  storedNotesVisible,
  videoMoments,
} from '../notes/overlay.ts';
import { useRoster } from '../rowers/useRoster.ts';
import { notesStrings } from '../notes/strings.ts';
import { VideoNotesOverlay } from '../notes/VideoNotesOverlay.tsx';
import { Player, type PlayerHandle } from '../player/Player.tsx';
import { Icon } from '../ui/icons.tsx';
import { videoDisplayName } from './displayName.ts';
import type { BoatClass } from '../../shared/boats.ts';
import { formatVideoFacts, sessionStrings, type Perspective, type VideoStatus } from './strings.ts';

interface VideoDetail {
  id: string;
  sessionId: string;
  sessionTitle: string;
  filename: string;
  seq: number | null;
  recordedAt: string | null;
  perspective: Perspective;
  status: VideoStatus;
  fpsNum: number | null;
  fpsDen: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  renditions: { name: string; width: number; height: number }[];
  boatType: BoatClass | null;
  lineup: LineupSeat[];
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

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

/** One of the club's own videos in the frame-accurate player (#49, #52). */
export function VideoPage() {
  const t = sessionStrings();
  const nt = notesStrings();
  const { id = '' } = useParams();
  const auth = useAuth();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [rendition, setRendition] = useState<string | null>(null);
  // The frame on screen: carried over when switching rendition, and where a new note goes.
  const frame = useRef(0);
  const [current, setCurrent] = useState(0);
  const player = useRef<PlayerHandle>(null);
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [momentRowers, setMomentRowers] = useState<MomentRowers[]>([]);
  const [momentShares, setMomentShares] = useState<MomentShares[]>([]);
  const roster = useRoster();
  const [tool, setTool] = useState<DrawingKind | null>(null);
  const [notesVisible, setNotesVisible] = useState(storedNotesVisible);
  const [noteHoldSeconds, setNoteHoldSeconds] = useState(storedNoteHoldSeconds);
  const [forRower, setForRower] = useState<string | null>(null);

  const toggleNotes = useCallback(() => {
    setNotesVisible((visible) => {
      rememberNotesVisible(!visible);
      return !visible;
    });
  }, []);

  // The player owns its other shortcuts; N belongs to the note overlay (#106).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'n' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        return;
      }
      event.preventDefault();
      toggleNotes();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toggleNotes]);

  const loadNotes = useCallback(() => {
    api(`/api/videos/${id}/annotations`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              annotations: Annotation[];
              moments?: MomentRowers[];
              shares?: MomentShares[];
            }>)
          : null,
      )
      .then((body) => {
        if (body !== null) {
          setNotes(body.annotations);
          setMomentRowers(body.moments ?? []);
          setMomentShares(body.shares ?? []);
        }
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

  const rowersInNotes = useMemo(() => rowersWithNotes(momentRowers), [momentRowers]);
  const accountEmail = auth.state.kind === 'open' ? auth.state.user.email.toLowerCase() : null;
  const myRower =
    accountEmail === null
      ? undefined
      : roster.rowers?.find((rower) => rower.email?.toLowerCase() === accountEmail);
  const filteredMoments = useMemo(
    () => videoMoments(notes, framesFor(momentRowers, forRower)),
    [notes, momentRowers, forRower],
  );
  const fps =
    video?.fpsNum != null && video.fpsDen != null && video.fpsDen > 0
      ? video.fpsNum / video.fpsDen
      : 30;
  const activeMoment = useMemo(() => {
    // While drawing, the exact frame remains visible even when playback annotations are off.
    if (!notesVisible && tool === null) return null;
    return activeVideoMoment(filteredMoments, current, fps, tool === null ? noteHoldSeconds : 0);
  }, [current, filteredMoments, fps, noteHoldSeconds, notesVisible, tool]);

  // One marker per filtered frame: its drawings and explanation together.
  const markers = useMemo(() => {
    if (!notesVisible) return [];
    return filteredMoments.map((m) => {
      const parts = [
        ...m.drawings.map((d) => describeDrawing(d, size)),
        ...m.notes.map((n) => (n.body.length > 80 ? `${n.body.slice(0, 80)}…` : n.body)),
      ];
      return { id: String(m.frame), frame: m.frame, label: nt.marker(m.frame, parts.join(' · ')) };
    });
  }, [filteredMoments, notesVisible, nt, size]);

  // Drawings stay with the explanation during its playback hold (#106).
  const drawingsHere = useMemo(
    () =>
      (activeMoment?.drawings ?? []).map((drawing) => ({
        id: drawing.id,
        kind: drawing.kind as DrawingKind,
        points: drawing.shape?.points ?? [],
      })),
    [activeMoment],
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
      void api(`/api/videos/${id}/annotations`, {
        method: 'POST',
        body: { kind, frame: frame.current, points },
      }).finally(loadNotes);
    },
    [id, loadNotes],
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
        <h1 className="video-title">{videoDisplayName(video)}</h1>
        <p className="muted video-facts">
          {t.perspectives[video.perspective]}
          {video.status === 'ready' && <> · {formatVideoFacts(video)}</>} · {video.filename}
        </p>
        <LineupSummary boatType={video.boatType} lineup={video.lineup} />
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
                <>
                  <DrawingLayer
                    size={size}
                    drawings={drawingsHere}
                    tool={tool}
                    onComplete={saveDrawing}
                    onCancel={cancelTool}
                  />
                  {notesVisible && tool === null && activeMoment !== null && (
                    <VideoNotesOverlay moment={activeMoment} />
                  )}
                </>
              }
              toolbar={
                <>
                  <div className="video-note-controls" role="group" aria-label={nt.videoNotes}>
                    <button
                      type="button"
                      className="button--quiet video-note-controls__toggle"
                      aria-pressed={notesVisible}
                      onClick={toggleNotes}
                    >
                      <Icon name="eye" />
                      {notesVisible ? nt.hideVideoNotes : nt.showVideoNotes}
                      <kbd>N</kbd>
                    </button>
                    <label className="video-note-controls__filter">
                      <span>{nt.hold}</span>
                      <select
                        value={noteHoldSeconds}
                        aria-label={nt.holdTime}
                        onChange={(event) => {
                          const value = Number(event.target.value) as NoteHoldSeconds;
                          setNoteHoldSeconds(value);
                          rememberNoteHoldSeconds(value);
                        }}
                      >
                        {NOTE_HOLD_OPTIONS.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {nt.seconds(seconds)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(rowersInNotes.length > 0 || myRower !== undefined) && (
                      <label className="video-note-controls__filter">
                        <span>{nt.notesFor}</span>
                        <select
                          value={forRower ?? ''}
                          aria-label={nt.noteFilter}
                          onChange={(event) => {
                            setForRower(event.target.value === '' ? null : event.target.value);
                          }}
                        >
                          <option value="">{nt.everyone}</option>
                          {myRower !== undefined && (
                            <option value={myRower.id}>{nt.myNotes}</option>
                          )}
                          {rowersInNotes
                            .filter((rower) => rower.id !== myRower?.id)
                            .map((rower) => (
                              <option key={rower.id} value={rower.id}>
                                {rower.displayName}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <DrawTools tool={tool} onTool={chooseTool} />
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
              authorName={auth.state.kind === 'open' ? auth.state.user.authorName : undefined}
              onChanged={loadNotes}
              momentRowers={momentRowers}
              momentShares={momentShares}
              roster={(roster.rowers ?? []).filter((r) => r.archivedAt === null)}
              suggestions={lineupSuggestions(
                video.boatType,
                video.lineup,
                lineupStrings().seatLabel,
              )}
              forRower={forRower}
              onForRowerChange={setForRower}
              onRosterChanged={() => void roster.reload()}
              onJump={(f, reveal) => {
                player.current?.seekToFrame(f);
                const stage = document.querySelector('.player__stage')?.getBoundingClientRect();
                if (
                  reveal &&
                  stage !== undefined &&
                  (stage.top < 0 || stage.bottom > window.innerHeight)
                ) {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
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
