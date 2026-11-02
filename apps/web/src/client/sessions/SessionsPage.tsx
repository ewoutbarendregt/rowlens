import { type SubmitEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BOAT_CLASS_NAMES, type BoatClass, seatRole } from '../../shared/boats.ts';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { lineupStrings } from '../lineup/strings.ts';
import { useRoster } from '../rowers/useRoster.ts';
import {
  activeFilters,
  applyFilters,
  DEFAULT_FILTERS,
  type Filters,
  readFilters,
  type SessionRow,
  SORTS,
  writeFilters,
} from './filter.ts';
import { formatCreatedTime, formatDate, sessionStrings } from './strings.ts';

interface SessionSummary extends SessionRow {
  id: string;
  boatType: BoatClass | null;
  mySeat: number | null;
  lineup: { seat: number; rowerId: string; displayName: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/**
 * The start page after login (#108): the sessions the viewer may see (the admin all, others their
 * own), filtered and sorted from the URL, so a reload or a shared link shows the same list.
 */
export function SessionsPage() {
  const t = sessionStrings();
  const l = lineupStrings();
  const { state } = useAuth();
  const unlinked = state.kind === 'open' && state.user.role !== 'admin' && !state.user.linked;
  const navigate = useNavigate();
  const formId = useId();
  const [params, setParams] = useSearchParams();
  // The page owns the filters; the URL mirrors them (reload and shared links keep them). Inputs bound
  // straight to the URL lag behind on phones, where the router updates it asynchronously.
  const [filters, setFilters] = useState<Filters>(() => readFilters(params));
  useEffect(() => {
    setParams(writeFilters(filters), { replace: true });
  }, [filters, setParams]);
  const roster = useRoster();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  // Open on a laptop or when filters are set, folded on a phone; after that the user decides. Not a
  // controlled `open`: re-renders would fight the user's own toggle.
  const filtersRef = useRef<HTMLDetailsElement>(null);

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

  const set = (change: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...change }));
  };

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

  const count = activeFilters(filters);
  const initiallyOpen = useRef(wide() || count > 0);
  useEffect(() => {
    if (filtersRef.current !== null && initiallyOpen.current) filtersRef.current.open = true;
  }, []);

  const shown = sessions === null ? [] : applyFilters(sessions, filters);
  const boats = BOAT_CLASS_NAMES.filter((b) => sessions?.some((s) => s.boatType === b));

  return (
    <main className="page">
      <div className="page__title">
        <h1>{t.sessions}</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            ＋ {t.newSession}
          </button>
        )}
      </div>
      {failed && <p role="alert">{t.loadFailed}</p>}
      {unlinked && (
        <p className="callout" role="status" data-testid="unlinked">
          {t.unlinked}
        </p>
      )}

      {creating && (
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
          <span className="form__actions">
            <button type="submit" disabled={busy || title.trim() === ''}>
              {t.create}
            </button>
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setCreating(false);
              }}
            >
              {t.cancel}
            </button>
          </span>
        </form>
      )}

      <details className="filters" ref={filtersRef} data-testid="filters">
        <summary>
          {t.filters}
          {count > 0 && <span className="badge">{count}</span>}
        </summary>
        <div className="filters__grid form">
          <label>
            {t.from}
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => {
                set({ from: e.target.value || null });
              }}
            />
          </label>
          <label>
            {t.to}
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => {
                set({ to: e.target.value || null });
              }}
            />
          </label>
          <label>
            {t.rower}
            <select
              value={filters.rower ?? ''}
              onChange={(e) => {
                set({ rower: e.target.value || null });
              }}
            >
              <option value="">{t.anyone}</option>
              {(roster.rowers ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {l.boat}
            <select
              value={filters.boat ?? ''}
              onChange={(e) => {
                set({ boat: e.target.value || null });
              }}
            >
              <option value="">{t.anyBoat}</option>
              {boats.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.search}
            <input
              type="search"
              value={filters.q}
              placeholder={t.searchTitle}
              onChange={(e) => {
                set({ q: e.target.value });
              }}
            />
          </label>
          <label>
            {t.sortBy}
            <select
              value={filters.sort}
              onChange={(e) => {
                set({ sort: e.target.value as Filters['sort'] });
              }}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t.sorts[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="filters__check">
            <input
              type="checkbox"
              checked={filters.mine}
              onChange={(e) => {
                set({ mine: e.target.checked });
              }}
            />
            {t.onlyMine}
          </label>
          {count > 0 && (
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setFilters((current) => ({ ...DEFAULT_FILTERS, sort: current.sort }));
              }}
            >
              {t.clearFilters}
            </button>
          )}
        </div>
      </details>

      {sessions !== null && sessions.length === 0 && <p className="muted">{t.noSessions}</p>}
      {sessions !== null && sessions.length > 0 && (
        <p className="muted" role="status">
          {t.showing(shown.length, sessions.length)}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="list" data-testid="session-list">
          {shown.map((s) => (
            <li key={s.id}>
              <Link className="list__item" to={`/sessions/${s.id}`} data-testid="session">
                <strong>
                  {s.title}
                  {s.boatType !== null && <span className="muted"> · {s.boatType}</span>}
                </strong>
                <span className="muted">
                  {formatDate(s.date)} · {t.createdAt(formatCreatedTime(s.createdAt))} ·{' '}
                  {t.videos(s.videoCount)}
                </span>
                {(s.mySeat !== null || s.notesForMe > 0) && (
                  <span className="session__me">
                    {s.mySeat !== null && s.boatType !== null && (
                      <span className="badge">
                        {l.seatLabel(seatRole(s.boatType, s.mySeat), s.mySeat)}
                      </span>
                    )}
                    {s.notesForMe > 0 && (
                      <span className="badge badge--ready">{t.notesForMe(s.notesForMe)}</span>
                    )}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
