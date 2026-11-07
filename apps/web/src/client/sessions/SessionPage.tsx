import { type SubmitEvent, useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth.ts';
import { api } from '../api.ts';
import { appUrl } from '../env.ts';
import {
  formatBytes,
  formatCreatedDay,
  formatCreatedTime,
  formatDate,
  formatVideoFacts,
  type Perspective,
  sessionStrings,
  type VideoStatus,
} from './strings.ts';
import type { BoatClass } from '../../shared/boats.ts';
import { LineupCard, LineupSummary, type LineupSeat } from '../lineup/LineupCard.tsx';
import { lineupStrings } from '../lineup/strings.ts';
import { Icon } from '../ui/icons.tsx';
import { crewText } from './filter.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { videoDisplayName } from './displayName.ts';
import { retryable, useUploads } from './useUploads.ts';

interface SessionVideo {
  id: string;
  filename: string;
  seq: number | null;
  recordedAt: string | null;
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
  createdAt: string;
  boatType: BoatClass | null;
  lineup: LineupSeat[];
  videos: SessionVideo[];
  /** Who made it (their name, else their e-mail address). */
  creatorName: string | null;
  /** The maker and all club coaches/admins may rename it (ADR-0020). */
  canRename: boolean;
  canEdit: boolean;
  /** Admin only (#108): who made it, and the coaches it can be given to. */
  creatorUserId?: string | null;
  coaches?: { userId: string; email: string }[];
}

const PERSPECTIVES: Perspective[] = ['boat', 'bank', 'drone'];

export function SessionPage() {
  const t = sessionStrings();
  const { state: auth } = useAuth();
  const rolesKey = auth.kind === 'open' ? auth.user.roles.join(',') : '';
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const inputId = useId();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Renaming in place (2026-11-03): null while not editing.
  const [newTitle, setNewTitle] = useState<string | null>(null);
  const [renameFailed, setRenameFailed] = useState(false);

  const load = useCallback(() => {
    api(`/api/sessions/${id}`)
      .then((res) =>
        res.ok ? (res.json() as Promise<SessionDetail>) : Promise.reject(new Error()),
      )
      .then(setSession)
      .catch(() => {
        setFailed(true);
      });
  }, [id, rolesKey]);
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

  const nameOf = (v: SessionVideo) =>
    videoDisplayName({
      sessionTitle: session?.title ?? '',
      seq: v.seq,
      recordedAt: v.recordedAt,
      durationMs: v.durationMs,
    });

  // A video waiting for the in-page "yes" (no browser popup).
  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = (v: SessionVideo) => {
    setConfirming(null);
    void api(`/api/videos/${v.id}`, { method: 'DELETE' }).finally(load);
  };
  const [confirmingSession, setConfirmingSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const removeSession = () => {
    if (deletingSession) return;
    setDeletingSession(true);
    setDeleteFailed(false);
    void api(`/api/sessions/${id}`, { method: 'DELETE' })
      .then((res) => {
        if (!res.ok) throw new Error();
        void navigate('/sessions', { replace: true });
      })
      .catch(() => {
        setDeleteFailed(true);
        setDeletingSession(false);
        setConfirmingSession(false);
      });
  };

  const rename = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newTitle === null) return;
    setRenameFailed(false);
    void api(`/api/sessions/${id}`, { method: 'PATCH', body: { title: newTitle } })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const { title } = (await res.json()) as { title: string };
        setSession((s) => (s === null ? s : { ...s, title }));
        setNewTitle(null);
      })
      .catch(() => {
        setRenameFailed(true);
      });
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
      {newTitle === null || !session.canEdit ? (
        <div className="session-title">
          <h1>{session.title}</h1>
          {session.canRename && (
            <button
              type="button"
              className="button--quiet session-title__edit"
              onClick={() => {
                setNewTitle(session.title);
              }}
            >
              <Icon name="pencil" size={14} /> {t.rename}
            </button>
          )}
        </div>
      ) : (
        <form className="form session-title__form" onSubmit={rename} data-testid="rename-form">
          <label htmlFor={`${inputId}-title`}>{t.renameLabel}</label>
          <input
            id={`${inputId}-title`}
            value={newTitle}
            maxLength={120}
            required
            autoFocus
            onChange={(e) => {
              setNewTitle(e.target.value);
            }}
          />
          <span className="form__actions">
            <button type="submit" disabled={newTitle.trim() === ''}>
              {t.save}
            </button>
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setNewTitle(null);
                setRenameFailed(false);
              }}
            >
              {t.cancel}
            </button>
          </span>
          {renameFailed && (
            <p role="alert" className="error">
              {t.renameFailed}
            </p>
          )}
        </form>
      )}
      <p className="muted">
        {formatDate(session.date)} ·{' '}
        {t.createdOn(formatCreatedDay(session.createdAt), formatCreatedTime(session.createdAt))}
        {session.creatorName !== null && <> {t.createdBy(session.creatorName)}</>}
      </p>

      {!session.canEdit && (
        <p className="muted" data-testid="training-read-only">
          {t.readOnly}
        </p>
      )}
      {session.coaches !== undefined && (
        <div className="form creator">
          <label htmlFor={`${inputId}-creator`}>{t.creator}</label>
          <select
            id={`${inputId}-creator`}
            value={session.creatorUserId ?? ''}
            onChange={(e) => {
              const userId = e.target.value === '' ? null : e.target.value;
              void api(`/api/sessions/${session.id}/creator`, {
                method: 'PATCH',
                body: { userId },
              }).then((res) => {
                if (res.ok) setSession((s) => (s === null ? s : { ...s, creatorUserId: userId }));
                else setFailed(true);
              });
            }}
          >
            <option value="">{t.noCreator}</option>
            {session.coaches.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.email}
              </option>
            ))}
          </select>
          <p className="muted hint">{t.creatorHint}</p>
        </div>
      )}

      {/* Videos first, with a plain button to add more (Ewout, 2026-11-03). */}
      <section className="card session-videos" aria-labelledby={`${inputId}-videos-h`}>
        <h2 id={`${inputId}-videos-h`}>{t.videosTitle}</h2>
        {session.videos.length === 0 && <p className="muted">{t.noVideos}</p>}
        <ul className="list" data-testid="video-list">
          {session.videos.map((v) => {
            const stopped =
              v.status === 'uploading' && !inQueue.has(`${v.filename}|${String(v.sizeBytes)}`);
            return (
              <li key={v.id} className="list__item video" data-testid="video">
                {v.status === 'ready' && (
                  <Link
                    to={`/videos/${v.id}`}
                    className="video__thumb"
                    aria-label={t.watch(nameOf(v))}
                  >
                    <img
                      src={appUrl(`/api/videos/${v.id}/media/poster`)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </Link>
                )}
                <div>
                  {v.status === 'ready' ? (
                    <Link to={`/videos/${v.id}`} className="video__name">
                      <strong>{nameOf(v)}</strong>
                    </Link>
                  ) : (
                    <strong>{nameOf(v)}</strong>
                  )}
                  <span className="muted">
                    {t.perspectives[v.perspective]} · {formatBytes(v.sizeBytes)}
                    {/* The file's own name only helps while it is on its way or refused. */}
                    {v.status !== 'ready' && <> · {v.filename}</>}
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
                {session.canEdit &&
                  (confirming === v.id ? (
                    <ConfirmInline
                      question={t.confirmDelete(nameOf(v))}
                      onConfirm={() => {
                        remove(v);
                      }}
                      onCancel={() => {
                        setConfirming(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="button--quiet"
                      onClick={() => {
                        setConfirmingSession(false);
                        setConfirming(v.id);
                      }}
                    >
                      {t.delete}
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
        {session.canEdit && (
          <>
            <label className="file-pick" htmlFor={inputId}>
              <Icon name="plus" />
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
            {uploads.queue.some((f) => f.state === 'pending' || retryable(f)) &&
              !uploads.active && (
                <button type="button" onClick={uploads.start}>
                  {t.start}
                </button>
              )}
          </>
        )}
      </section>

      {/* The lineup below, folded: it is set once, the videos are what you come for. */}
      <details className="lineup-fold" data-testid="lineup-fold">
        <summary>
          <span className="lineup-fold__title">{lineupStrings().lineup}</span>
          <span className="muted lineup-fold__summary">
            {session.boatType === null && session.lineup.length === 0
              ? t.noLineup
              : [
                  session.boatType,
                  crewText(
                    session.lineup.map((s) => ({ seat: s.seat, displayName: s.rower.displayName })),
                    t.cox,
                  ),
                ]
                  .filter((part) => part !== null && part !== '')
                  .join(' · ')}
          </span>
        </summary>
        {session.canEdit ? (
          <LineupCard
            sessionId={session.id}
            boatType={session.boatType}
            lineup={session.lineup}
            onSaved={(boatType, lineup) => {
              setSession((s) => (s === null ? s : { ...s, boatType, lineup }));
            }}
          />
        ) : (
          <LineupSummary boatType={session.boatType} lineup={session.lineup} />
        )}
      </details>

      {session.canEdit && (
        <section className="card danger-zone" aria-labelledby={`${inputId}-delete-h`}>
          <h2 id={`${inputId}-delete-h`}>{t.deleteSession}</h2>
          <p className="muted">{t.deleteSessionHint}</p>
          {deleteFailed && <p role="alert">{t.deleteSessionFailed}</p>}
          {confirmingSession ? (
            <ConfirmInline
              question={t.confirmDeleteSession(session.title, t.videos(session.videos.length))}
              onConfirm={removeSession}
              onCancel={() => {
                setConfirmingSession(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="button--danger"
              disabled={deletingSession}
              onClick={() => {
                setConfirming(null);
                setConfirmingSession(true);
              }}
            >
              {t.deleteSession}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
