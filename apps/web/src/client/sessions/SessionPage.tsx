import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import {
  formatBytes,
  formatDate,
  formatVideoFacts,
  type Perspective,
  sessionStrings,
  type VideoStatus,
} from './strings.ts';
import { retryable, useUploads } from './useUploads.ts';

interface SessionVideo {
  id: string;
  filename: string;
  perspective: Perspective;
  status: VideoStatus;
  statusReason: string | null;
  processingProgress: number | null;
  fpsNum: number | null;
  fpsDen: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sizeBytes: number;
  uploadedBytes: number;
}

/** While the worker has videos of this session, the page refreshes itself (#48). */
const POLL_MS = 3000;
const BUSY: VideoStatus[] = ['uploaded', 'processing'];

interface SessionDetail {
  id: string;
  title: string;
  date: string;
  videos: SessionVideo[];
}

const PERSPECTIVES: Perspective[] = ['boat', 'bank', 'drone'];

export function SessionPage() {
  const t = sessionStrings();
  const { id = '' } = useParams();
  const inputId = useId();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api(`/api/sessions/${id}`)
      .then((res) =>
        res.ok ? (res.json() as Promise<SessionDetail>) : Promise.reject(new Error()),
      )
      .then(setSession)
      .catch(() => {
        setFailed(true);
      });
  }, [id]);
  useEffect(load, [load]);

  const busy = session?.videos.some((v) => BUSY.includes(v.status)) ?? false;
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [busy, load]);

  const uploads = useUploads(id, load);
  // Videos this tab is uploading right now are shown in the queue, not as "stopped".
  const inQueue = new Set(uploads.queue.map((f) => `${f.file.name}|${String(f.file.size)}`));

  const remove = (v: SessionVideo) => {
    if (!window.confirm(t.confirmDelete(v.filename))) return;
    void api(`/api/videos/${v.id}`, { method: 'DELETE' }).finally(load);
  };

  if (failed) {
    return (
      <main className="page">
        <p role="alert">{t.loadFailed}</p>
        <Link to="/sessions">{t.back}</Link>
      </main>
    );
  }
  if (session === null) return null;

  return (
    <main className="page">
      <nav className="page__nav">
        <Link to="/sessions">← {t.back}</Link>
      </nav>
      <h1>{session.title}</h1>
      <p className="muted">{formatDate(session.date)}</p>

      {session.videos.length === 0 && <p className="muted">{t.noVideos}</p>}
      <ul className="list" data-testid="video-list">
        {session.videos.map((v) => {
          const stopped =
            v.status === 'uploading' && !inQueue.has(`${v.filename}|${String(v.sizeBytes)}`);
          return (
            <li key={v.id} className="list__item video" data-testid="video">
              <div>
                <strong>{v.filename}</strong>
                <span className="muted">
                  {t.perspectives[v.perspective]} · {formatBytes(v.sizeBytes)}
                </span>
                <span className={`badge badge--${v.status}`} data-testid="video-status">
                  {v.status === 'processing' && v.processingProgress !== null
                    ? t.processingAt(v.processingProgress)
                    : t.status[v.status]}
                </span>
                {v.status === 'ready' && (
                  <span className="muted" data-testid="video-facts">
                    {formatVideoFacts(v)}
                  </span>
                )}
                {v.status === 'failed' && v.statusReason !== null && (
                  <span className="error">
                    {t.failReasons[v.statusReason] ?? t.failReasons['processing_failed']}
                  </span>
                )}
                {stopped && (
                  <span className="muted">
                    {t.incomplete(Math.floor((v.uploadedBytes / v.sizeBytes) * 100))}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="button--quiet"
                onClick={() => {
                  remove(v);
                }}
              >
                {t.delete}
              </button>
            </li>
          );
        })}
      </ul>

      <section className="card form" aria-labelledby={`${inputId}-h`}>
        <h2 id={`${inputId}-h`}>{t.upload}</h2>
        <label className="file-pick" htmlFor={inputId}>
          {t.chooseFiles}
        </label>
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept="video/*,.mov,.mp4,.m4v,.webm,.mkv"
          multiple
          onChange={(e) => {
            if (e.target.files !== null) uploads.add(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="muted">{t.chooseHint}</p>

        {uploads.queue.length > 0 && (
          <ul className="list" data-testid="upload-queue">
            {uploads.queue.map((f) => (
              <li key={f.id} className="list__item upload">
                <div>
                  <strong>{f.file.name}</strong>
                  <span className="muted">{formatBytes(f.file.size)}</span>
                  {f.state === 'pending' && (
                    <label>
                      {t.perspective}{' '}
                      <select
                        value={f.perspective}
                        onChange={(e) => {
                          uploads.setPerspective(f.id, e.target.value as Perspective);
                        }}
                      >
                        {PERSPECTIVES.map((p) => (
                          <option key={p} value={p}>
                            {t.perspectives[p]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {f.state !== 'pending' && (
                    <progress max={100} value={f.progress} aria-label={f.file.name}>
                      {t.progress(f.progress)}
                    </progress>
                  )}
                  {f.state === 'uploading' && <span>{t.progress(f.progress)}</span>}
                  {f.state === 'done' && <span data-testid="upload-done">{t.done}</span>}
                  {f.state === 'error' && f.error !== undefined && (
                    <span role="alert" className="error">
                      {t.errors[f.error]}
                    </span>
                  )}
                </div>
                {f.state === 'pending' && (
                  <button
                    type="button"
                    className="button--quiet"
                    onClick={() => {
                      uploads.remove(f.id);
                    }}
                  >
                    {t.remove}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {uploads.queue.some((f) => f.state === 'pending' || retryable(f)) && !uploads.active && (
          <button type="button" onClick={uploads.start}>
            {t.start}
          </button>
        )}
      </section>
    </main>
  );
}
