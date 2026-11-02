import { type SubmitEvent, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api.ts';
import { rowerStrings } from '../rowers/strings.ts';
import { formatCreatedTime, formatDate, sessionStrings } from './strings.ts';

interface SessionSummary {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  boatType: string | null;
  videoCount: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function SessionsPage() {
  const t = sessionStrings();
  const navigate = useNavigate();
  const formId = useId();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/sessions')
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ sessions: SessionSummary[] }>)
          : Promise.reject(new Error()),
      )
      .then((body) => {
        setSessions(body.sessions);
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  const create = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    void api('/api/sessions', { method: 'POST', body: { title, date } })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const { id } = (await res.json()) as { id: string };
        void navigate(`/sessions/${id}`);
      })
      .catch(() => {
        setFailed(true);
        setBusy(false);
      });
  };

  return (
    <main className="page">
      <nav className="page__nav">
        <Link to="/">{t.home}</Link> · <Link to="/rowers">{rowerStrings().rowers}</Link>
      </nav>
      <h1>{t.sessions}</h1>
      {failed && <p role="alert">{t.loadFailed}</p>}

      <form className="card form" onSubmit={create} aria-labelledby={`${formId}-h`}>
        <h2 id={`${formId}-h`}>{t.newSession}</h2>
        <label htmlFor={`${formId}-title`}>{t.title}</label>
        <input
          id={`${formId}-title`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          placeholder={t.titlePlaceholder}
          maxLength={120}
          required
        />
        <label htmlFor={`${formId}-date`}>{t.date}</label>
        <input
          id={`${formId}-date`}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
          required
        />
        <button type="submit" disabled={busy || title.trim() === ''}>
          {t.create}
        </button>
      </form>

      {sessions !== null && sessions.length === 0 && <p className="muted">{t.noSessions}</p>}
      {sessions !== null && sessions.length > 0 && (
        <ul className="list" data-testid="session-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link className="list__item" to={`/sessions/${s.id}`}>
                <strong>
                  {s.title}
                  {s.boatType !== null && <span className="muted"> · {s.boatType}</span>}
                </strong>
                <span className="muted">
                  {formatDate(s.date)} · {t.createdAt(formatCreatedTime(s.createdAt))} ·{' '}
                  {t.videos(s.videoCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
