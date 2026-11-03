import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { appUrl } from '../env.ts';
import { type Drawing, DrawingLayer } from '../drawing/DrawingLayer.tsx';
import { DrawTools } from '../drawing/DrawTools.tsx';
import { LineupSummary, type LineupSeat } from '../lineup/LineupCard.tsx';
import type { DrawingKind, Point } from '../drawing/geometry.ts';
import { lineupStrings } from '../lineup/strings.ts';
import {
  framesFor,
  lineupSuggestions,
  type MomentRowers,
  type MomentShares,
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
import { StrokesPanel } from '../strokes/StrokesPanel.tsx';
import { AnglesPanel, type Measuring } from '../angles/AnglesPanel.tsx';
import { angleStrings, leanText } from '../angles/strings.ts';
import {
  type AngleMeasure,
  angleTables,
  boatLineAt,
  type FrameBoatLine,
  measureValue,
  phaseOf,
} from '../../shared/angles.ts';
import { rememberDriveMiddle, storedDriveMiddle } from '../strokes/preferences.ts';
import { strokeStrings } from '../strokes/strings.ts';
import {
  neighbourCatch,
  type StrokeMark,
  type StrokeMarkKind,
  strokesFrom,
} from '../../shared/strokes.ts';
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
  // Stroke marks (#85): loaded with the page, changed by coaches of the session and the admin.
  const [marks, setMarks] = useState<StrokeMark[]>([]);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const [marking, setMarking] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);
  const [sideTab, setSideTab] = useState<'notes' | 'strokes' | 'angles'>('notes');
  // Angle measurements per phase (ADR-0017) and the boat line the upper body is measured against.
  const [measures, setMeasures] = useState<AngleMeasure[]>([]);
  const [boatLines, setBoatLines] = useState<FrameBoatLine[]>([]);
  const [measuring, setMeasuring] = useState<Measuring | null>(null);
  const [angleBusy, setAngleBusy] = useState(false);
  const [angleFailed, setAngleFailed] = useState(false);
  const [driveMiddle, setDriveMiddle] = useState(storedDriveMiddle);
  const canMark = auth.state.kind === 'open' && auth.state.user.role !== 'rower';

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

  const loadMarks = useCallback(() => {
    api(`/api/videos/${id}/strokes`)
      .then((res) => (res.ok ? (res.json() as Promise<{ marks: StrokeMark[] }>) : null))
      .then((body) => {
        if (body !== null) setMarks(body.marks);
      })
      .catch(() => {
        // The player still works; the strokes tab shows what it has.
      });
  }, [id]);
  useEffect(loadMarks, [loadMarks]);

  const loadAngles = useCallback(() => {
    api(`/api/videos/${id}/angles`)
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ measures: AngleMeasure[]; boatLines: FrameBoatLine[] }>)
          : null,
      )
      .then((body) => {
        if (body === null) return;
        setMeasures(body.measures);
        setBoatLines(body.boatLines);
      })
      .catch(() => {
        // The player still works; the angles tab shows what it has.
      });
  }, [id]);
  useEffect(loadAngles, [loadAngles]);

  /** Saves, changes or removes an angle measurement or the boat line, then reloads them. */
  const angleRequest = useCallback(
    (path: string, method: 'PUT' | 'DELETE', body?: unknown) => {
      setAngleBusy(true);
      setAngleFailed(false);
      void api(path, { method, ...(body === undefined ? {} : { body }) })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          loadAngles();
        })
        .catch(() => {
          setAngleFailed(true);
        })
        .finally(() => {
          setAngleBusy(false);
        });
    },
    [loadAngles],
  );

  /** Marks the frame on screen; the same kind there again takes the mark off. */
  const markAt = useCallback(
    (kind: StrokeMarkKind) => {
      const at = frame.current;
      const same = marksRef.current.some((m) => m.frame === at && m.kind === kind);
      setMarking(true);
      setMarkFailed(false);
      void api(`/api/videos/${id}/strokes/${String(at)}`, {
        method: same ? 'DELETE' : 'PUT',
        ...(same ? {} : { body: { kind } }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          loadMarks();
        })
        .catch(() => {
          setMarkFailed(true);
        })
        .finally(() => {
          setMarking(false);
        });
    },
    [id, loadMarks],
  );

  // I / H / U mark (coaches), ↑ / ↓ go to the previous / next catch (everyone). Like the player's own
  // keys, they also work while the scrub bar has focus; its arrows stay its own.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const onSlider = event.target instanceof HTMLInputElement && event.target.type === 'range';
      if (isTyping(event.target) && !onSlider) return;
      const key = event.key.toLowerCase();
      const kind: StrokeMarkKind | null =
        key === 'i' ? 'catch' : key === 'h' ? 'half_slide' : key === 'u' ? 'finish' : null;
      if (kind !== null) {
        if (!canMark) return;
        event.preventDefault();
        markAt(kind);
        return;
      }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !onSlider) {
        const to = neighbourCatch(
          marksRef.current,
          frame.current,
          event.key === 'ArrowUp' ? -1 : 1,
        );
        if (to === null) return;
        event.preventDefault();
        player.current?.seekToFrame(to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [canMark, markAt]);

  // The picture's display size (after rotation): the drawings' coordinate system.
  const size = useMemo(
    () =>
      video?.width != null && video.height != null
        ? { width: video.width, height: video.height }
        : { width: 1920, height: 1080 },
    [video?.width, video?.height],
  );

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
  const strokeSummary = useMemo(() => strokesFrom(marks, fps), [marks, fps]);
  const strokeMarks = useMemo(() => {
    const st = strokeStrings();
    const marked = marks.map((m) => {
      const stroke = strokeSummary.strokes.find(
        (s) => m.frame >= s.catch && (s.nextCatch === null || m.frame < s.nextCatch),
      );
      return { ...m, label: st.markLabel(st.kinds[m.kind], stroke?.number ?? null, m.frame) };
    });
    if (!driveMiddle) return marked;
    // The computed middle of each drive, where the coach didn't mark a half slide on it.
    const computed = strokeSummary.strokes.flatMap((s) =>
      s.driveMiddle === null || s.halfSlideDrive !== null
        ? []
        : [
            {
              frame: s.driveMiddle,
              kind: 'drive_middle' as const,
              label: st.markLabel(st.driveMiddle, s.number, s.driveMiddle),
            },
          ],
    );
    return [...marked, ...computed].sort((a, b) => a.frame - b.frame);
  }, [marks, strokeSummary, driveMiddle]);
  const angleRowers = useMemo(() => {
    const crew =
      video === null
        ? []
        : lineupSuggestions(video.boatType, video.lineup, lineupStrings().seatLabel);
    // Anyone measured who isn't in this lineup (e.g. after a change) still gets a name.
    const others = (roster.rowers ?? [])
      .filter((r) => !crew.some((c) => c.id === r.id) && measures.some((m) => m.rowerId === r.id))
      .map((r) => ({ id: r.id, label: '–', name: r.displayName }));
    return [...crew, ...others];
  }, [video, roster.rowers, measures]);
  const anglesNow = useMemo(
    () =>
      angleTables(
        measures,
        strokeSummary,
        size,
        boatLines,
        angleRowers.map((r) => r.id),
      ),
    [measures, strokeSummary, size, boatLines, angleRowers],
  );
  const phaseHere = useMemo(() => {
    const phase = phaseOf(current, strokeSummary);
    if (phase === null) return null;
    const stroke = strokeSummary.strokes.find(
      (s) => current >= s.catch && (s.nextCatch === null || current < s.nextCatch),
    );
    return { phase, stroke: stroke?.number ?? null };
  }, [current, strokeSummary]);
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
    if (next !== null) setMeasuring(null);
  }, []);
  const cancelTool = useCallback(() => {
    setTool(null);
    setMeasuring(null);
  }, []);

  /** Starts tapping the boat line or a rower's joint on the picture (ADR-0017). */
  const startMeasuring = useCallback(
    (next: Measuring | null) => {
      chooseTool(null);
      if (next !== null) {
        player.current?.pause();
        const stage = document.querySelector('.player__stage');
        const box = stage?.getBoundingClientRect();
        if (box !== undefined && (box.top < 0 || box.bottom > window.innerHeight)) {
          stage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      setMeasuring(next);
    },
    [chooseTool],
  );

  const saveDrawing = useCallback(
    (kind: DrawingKind, points: Point[]) => {
      void api(`/api/videos/${id}/annotations`, {
        method: 'POST',
        body: { kind, frame: frame.current, points },
      }).finally(loadNotes);
    },
    [id, loadNotes],
  );

  // The picture serves both: a drawing, or the points of a measurement or the boat line.
  const layerTool: DrawingKind | null =
    measuring === null
      ? tool
      : measuring.kind === 'boat_line' || measuring.joint === 'trunk'
        ? 'line'
        : 'angle';
  const completeLayer = useCallback(
    (kind: DrawingKind, points: Point[]) => {
      if (measuring === null) {
        saveDrawing(kind, points);
        return;
      }
      setMeasuring(null);
      if (measuring.kind === 'boat_line') {
        angleRequest(`/api/videos/${id}/boat-line`, 'PUT', { frame: frame.current, points });
      } else {
        angleRequest(`/api/videos/${id}/angles`, 'PUT', {
          frame: frame.current,
          rowerId: measuring.rowerId,
          joint: measuring.joint,
          points,
        });
      }
    },
    [measuring, saveDrawing, angleRequest, id],
  );

  // On the picture: the note's drawings, the angles measured on exactly this frame, and the boat
  // line while the Angles tab is open or it is being drawn.
  const pictureDrawings = useMemo(() => {
    // The boat line that applies on this frame (a moving camera turns the boat).
    const lineHere = boatLineAt(current, boatLines);
    const at = angleStrings();
    const nameOf = (rowerId: string) =>
      (angleRowers.find((r) => r.id === rowerId)?.name ?? '').trim().split(/\s+/)[0] ?? '';
    const measured = measures
      .filter((m) => m.frame === current)
      .map((m): Drawing => {
        const value = measureValue(m, size, boatLineAt(m.frame, boatLines)?.points ?? null);
        const label =
          m.joint === 'trunk' && value.ok
            ? `${nameOf(m.rowerId)} · ${leanText(value.degrees, at)}`
            : `${nameOf(m.rowerId)} · ${at.joints[m.joint]}`;
        return {
          id: `measure-${m.id}`,
          kind: m.joint === 'trunk' ? 'line' : 'angle',
          points: m.points,
          label,
          variant: 'measure',
        };
      });
    const line: Drawing[] =
      lineHere !== null && (sideTab === 'angles' || measuring?.kind === 'boat_line')
        ? [{ id: 'boat-line', kind: 'line', points: lineHere.points, variant: 'boat' }]
        : [];
    return [...drawingsHere, ...measured, ...line];
  }, [drawingsHere, measures, current, size, boatLines, angleRowers, sideTab, measuring]);

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
      {/* Mockup 1e: back, title and facts on the left; the lineup as columns on the right. */}
      <header className="video-head">
        <div className="video-head__main">
          <Link className="video-head__back" to={`/sessions/${video.sessionId}`}>
            <Icon name="arrowLeft" size={14} /> {t.backToSession(video.sessionTitle)}
          </Link>
          <h1 className="video-title">{videoDisplayName(video)}</h1>
          <p className="muted video-facts">
            {t.perspectives[video.perspective]}
            {video.status === 'ready' && <> · {formatVideoFacts(video)}</>}
          </p>
        </div>
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
              keyHints={[
                nt.notesKey,
                ...(canMark ? [strokeStrings().keyHintMark] : []),
                strokeStrings().keyHintJump,
              ]}
              strokeMarks={strokeMarks}
              overlay={
                <>
                  <DrawingLayer
                    size={size}
                    drawings={pictureDrawings}
                    tool={layerTool}
                    onComplete={completeLayer}
                    onCancel={cancelTool}
                  />
                  {notesVisible && layerTool === null && activeMoment !== null && (
                    <VideoNotesOverlay moment={activeMoment} />
                  )}
                </>
              }
              toolbar={
                <>
                  <DrawTools tool={tool} onTool={chooseTool} />
                  <div className="player__toolbar-end">
                    <div className="video-note-controls" role="group" aria-label={nt.videoNotes}>
                      <button
                        type="button"
                        className="button--quiet video-note-controls__toggle"
                        aria-pressed={notesVisible}
                        onClick={toggleNotes}
                      >
                        <Icon name="eye" />
                        {notesVisible ? nt.hideVideoNotes : nt.showVideoNotes}
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
                    </div>
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
                  </div>
                </>
              }
            />
          </div>
          <aside className="video-layout__side">
            {/* Notes | Strokes (#85). Both stay mounted, so a note being typed survives a switch. */}
            <div className="tabs side-tabs" role="tablist" aria-label={strokeStrings().strokes}>
              {(['notes', 'strokes', 'angles'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  id={`side-tab-${name}`}
                  aria-selected={sideTab === name}
                  aria-controls={`side-panel-${name}`}
                  className="tabs__tab"
                  onClick={() => {
                    setSideTab(name);
                  }}
                >
                  {name === 'angles' ? angleStrings().angles : strokeStrings()[name]}
                  {name === 'strokes' && strokeSummary.strokes.length > 0 && (
                    <span className="side-tabs__count"> · {strokeSummary.strokes.length}</span>
                  )}
                  {name === 'angles' && measures.length > 0 && (
                    <span className="side-tabs__count"> · {measures.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="side-panel-notes"
              aria-labelledby="side-tab-notes"
              hidden={sideTab !== 'notes'}
            >
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
                myRowerId={myRower?.id}
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
            </div>
            <div
              role="tabpanel"
              id="side-panel-strokes"
              aria-labelledby="side-tab-strokes"
              hidden={sideTab !== 'strokes'}
            >
              <StrokesPanel
                summary={strokeSummary}
                marks={marks}
                fps={fps}
                frame={current}
                canMark={canMark}
                busy={marking}
                failed={markFailed}
                onMark={markAt}
                onJump={(f) => {
                  player.current?.seekToFrame(f);
                }}
                onLoop={(loopIn, loopOut) => {
                  player.current?.setLoop(loopIn, loopOut);
                }}
                driveMiddle={driveMiddle}
                onDriveMiddleChange={(on) => {
                  setDriveMiddle(on);
                  rememberDriveMiddle(on);
                }}
              />
            </div>
            <div
              role="tabpanel"
              id="side-panel-angles"
              aria-labelledby="side-tab-angles"
              hidden={sideTab !== 'angles'}
            >
              <AnglesPanel
                tables={anglesNow}
                measures={measures}
                boatLines={boatLines}
                fps={fps}
                size={size}
                rowers={angleRowers}
                here={phaseHere}
                frame={current}
                canMeasure={canMark}
                notFromTheSide={video.perspective === 'boat' || video.perspective === 'drone'}
                measuring={measuring}
                busy={angleBusy}
                failed={angleFailed}
                onMeasure={startMeasuring}
                onDelete={(measureId) => {
                  angleRequest(`/api/angles/${measureId}`, 'DELETE');
                }}
                onRemoveBoatLine={(lineFrame) => {
                  angleRequest(`/api/videos/${id}/boat-line/${String(lineFrame)}`, 'DELETE');
                }}
                onJump={(f) => {
                  player.current?.seekToFrame(f);
                }}
              />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
