import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import { appUrl } from '../env.ts';
import { type Note, NotesPanel } from '../notes/NotesPanel.tsx';
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
  const [notes, setNotes] = useState<Note[]>([]);

  const loadNotes = useCallback(() => {
    api(`/api/videos/${id}/annotations`)
      .then((res) => (res.ok ? (res.json() as Promise<{ annotations: Note[] }>) : null))
      .then((body) => {
        if (body !== null) setNotes(body.annotations);
      })
      .catch(() => {
        // The player still works; the panel shows what it has.
      });
  }, [id]);
  useEffect(loadNotes, [loadNotes]);

  const markers = useMemo(() => {
    const nt = notesStrings();
    return notes.map((n) => ({
      id: n.id,
      frame: n.frame,
      label: nt.marker(n.frame, n.body.length > 80 ? `${n.body.slice(0, 80)}…` : n.body),
    }));
  }, [notes]);

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
  const ready = video.status === 'ready' && rendition !== null && video.fpsNum !== null;

  return (
    <main className="page page--wide">
      <nav className="page__nav">
        <Link to={`/sessions/${video.sessionId}`}>← {t.backToSession(video.sessionTitle)}</Link>
      </nav>
      <h1 className="video-title">{video.filename}</h1>
      <p className="muted">
        {t.perspectives[video.perspective]}
        {video.status === 'ready' && <> · {formatVideoFacts(video)}</>}
      </p>

      {!ready && <p role="status">{t.notReady}</p>}
      {ready && video.fpsNum !== null && video.fpsDen !== null && (
        <>
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
          />
          {video.renditions.length > 1 && (
            <div className="quality" role="group" aria-label={t.quality}>
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
              <span className="muted">{t.qualityHint}</span>
            </div>
          )}
          <NotesPanel
            videoId={video.id}
            fps={video.fpsNum / video.fpsDen}
            frame={current}
            notes={notes}
            onChanged={loadNotes}
            onJump={(f) => {
              player.current?.seekToFrame(f);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onWriting={() => {
              player.current?.pause();
            }}
          />
        </>
      )}
    </main>
  );
}
