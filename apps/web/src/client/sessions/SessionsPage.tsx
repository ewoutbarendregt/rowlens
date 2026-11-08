import { admissionStrings } from '../admin/admission-strings.ts';
import { appUrl } from '../env.ts';
import { type SubmitEvent, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BOAT_CLASS_NAMES, type BoatClass, seatRole } from '../../shared/boats.ts';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { lineupStrings } from '../lineup/strings.ts';
import { useRoster } from '../rowers/useRoster.ts';
import { Icon } from '../ui/icons.tsx';
import {
  activeFilters,
  applyFilters,
  crewText,
  DEFAULT_FILTERS,
  groupByMonth,
  type Filters,
  readFilters,
  type SessionRow,
  SORTS,
  writeFilters,
} from './filter.ts';
import {
  formatCreatedDay,
  formatCreatedTime,
  formatDayParts,
  formatMonth,
  sessionStrings,
} from './strings.ts';
import { DEFAULT_BOAT } from '../ui/ProfileForm.tsx';

interface SessionSummary extends SessionRow {
  id: string;
  clubId?: string;
  clubName?: string;
  boatType: BoatClass | null;
  /** Who made it (their name, else their e-mail address); null when nobody is set. */
  creatorName: string | null;
  mySeat: number | null;
  lineup: { seat: number; rowerId: string; displayName: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const WIDE = '(min-width: 768px)';
const wide = () => typeof window !== 'undefined' && window.matchMedia(WIDE).matches;

/**
 * The start page after login (#108): the sessions the viewer may see (the admin all, others their
 * own), filtered and sorted from the URL, so a reload or a shared link shows the same list.
 */
export function SessionsPage() {
  const t = sessionStrings();
  const l = lineupStrings();
  const { state } = useAuth();
  const unlinked =
    state.kind === 'open' && !state.user.roles.includes('admin') && !state.user.linked;
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
  const [createClub, setCreateClub] = useState(state.kind === 'open' ? (state.club.id ?? '') : '');
  const actor = state.kind === 'open' ? state.user.id : null;
  const clubSignature = state.kind === 'open' ? JSON.stringify(state.clubs) : '';
  const unified = state.kind === 'open' && state.unified === true;
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  // A new session starts with the member's own default boat, else C4x+ (Ewout, 2026-11-03).
  const ownBoat = state.kind === 'open' ? state.user.defaultBoatType : null;
  const [boat, setBoat] = useState<BoatClass | null>(null);
  const chosenBoat = boat ?? ownBoat ?? DEFAULT_BOAT;
  const [busy, setBusy] = useState(false);
  // Open on a laptop or when filters are set, folded on a phone; after that the user decides. Not a
  // controlled `open`: re-renders would fight the user's own toggle.
  const filtersRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const load = new AbortController();
    setSessions(null);
    setFailed(false);
    void (async () => {
      const rows: SessionSummary[] = [];
      const cursor: { next: string | null } = { next: null };
      do {
        const path = unified
          ? `/api/account/sessions${cursor.next ? '?' + new URLSearchParams({ cursor: cursor.next }).toString() : ''}`
          : '/api/sessions';
        const r = await api(path, unified ? { clubId: null } : {});
        if (!r.ok) throw new Error();
        const body = (await r.json()) as { sessions: SessionSummary[]; next?: string | null };
        if (load.signal.aborted) return;
        rows.push(...body.sessions);
        cursor.next = body.next ?? null;
      } while (cursor.next);
      setSessions(rows);
    })().catch(() => {
      if (!load.signal.aborted) setFailed(true);
    });
    return () => {
      load.abort();
    };
  }, [actor, clubSignature, unified]);
  const sessionUrl = (s: SessionSummary) => {
    const url = new URL(appUrl(`/sessions/${s.id}`), window.location.origin);
    if (s.clubId) url.searchParams.set('club', s.clubId);
    return url.pathname + url.search;
  };
  const openSession = (s: SessionSummary) => {
    if (unified) window.location.assign(sessionUrl(s));
    else void navigate(`/sessions/${s.id}`);
  };

  const set = (change: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...change }));
  };

  const create = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    void api('/api/sessions', {
      method: 'POST',
      body: { title, date, boatType: chosenBoat },
      ...(unified ? { clubId: createClub } : {}),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const { id } = (await res.json()) as { id: string };
        if (unified) {
          const url = new URL(appUrl(`/sessions/${id}`), window.location.origin);
          url.searchParams.set('club', createClub);
          window.location.assign(url.toString());
        } else void navigate(`/sessions/${id}`);
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
    // On a laptop the filters are a row without a toggle (mockup 1d): growing the window opens them.
    const query = window.matchMedia(WIDE);
    const onChange = () => {
      if (query.matches && filtersRef.current !== null) filtersRef.current.open = true;
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  const filterRowers = unified
    ? [
        ...new Map(
          (sessions ?? [])
            .flatMap((s) => s.lineup)
            .map((s) => [s.rowerId, { id: s.rowerId, displayName: s.displayName }]),
        ).values(),
      ].sort((a, b) => a.displayName.localeCompare(b.displayName))
    : (roster.rowers ?? []);
  const shown = sessions === null ? [] : applyFilters(sessions, filters);
  const boats = BOAT_CLASS_NAMES.filter((b) => sessions?.some((s) => s.boatType === b));
  const groups = groupByMonth(shown, filters.sort);
  const withNotes = shown.filter((s) => s.notesForMe > 0).length;

  return (
    <main className="page page--wide">
      <div className="page__title">
        <div>
          <h1>{t.sessions}</h1>
          {sessions !== null && sessions.length > 0 && (
            <p className="page__count" role="status">
              {t.showing(shown.length, sessions.length)}
              {withNotes > 0 && <> · {t.withNotesForYou(withNotes)}</>}
            </p>
          )}
        </div>
        {!creating && (!unified || !!state.clubs?.length) && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            <Icon name="plus" /> {t.newSession}
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
          {unified && (
            <label>
              {admissionStrings().clubFilter}
              <select
                required
                value={createClub}
                onChange={(e) => {
                  setCreateClub(e.target.value);
                }}
              >
                <option value="" disabled>
                  {admissionStrings().clubFilter}
                </option>
                {state.clubs?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
          <label htmlFor={`${formId}-boat`}>{t.boat}</label>
          <select
            id={`${formId}-boat`}
            value={chosenBoat}
            onChange={(e) => {
              setBoat(e.target.value as BoatClass);
            }}
          >
            {BOAT_CLASS_NAMES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
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
          {unified && (
            <>
              <label>
                {admissionStrings().clubFilter}
                <select
                  aria-label={admissionStrings().clubFilter}
                  value={filters.club ?? ''}
                  onChange={(e) => {
                    set({ club: e.target.value || null });
                  }}
                >
                  <option value="">{admissionStrings().allClubs}</option>
                  {state.clubs?.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="filters__search">
            {t.search}
            <span className="search-field">
              <Icon name="search" size={15} />
              <input
                type="search"
                value={filters.q}
                placeholder={t.searchTitle}
                onChange={(e) => {
                  set({ q: e.target.value });
                }}
              />
            </span>
          </label>
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
              {filterRowers.map((r) => (
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
        </div>
        <div className="filters__footer">
          {unified && (
            <label className="filters__check">
              <input
                type="checkbox"
                aria-label={admissionStrings().participating}
                checked={filters.participating}
                onChange={(e) => {
                  set({ participating: e.target.checked });
                }}
              />
              {admissionStrings().participating}
            </label>
          )}
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
          <span className="filters__hint">{t.filtersInLink}</span>
        </div>
      </details>

      {sessions !== null && sessions.length === 0 && <p className="muted">{t.noSessions}</p>}
      {groups.length > 0 && (
        <div data-testid="session-list">
          {groups.map((group) => (
            <section key={group.month ?? 'all'} className="month">
              {group.month !== null && <h2 className="month__title">{formatMonth(group.month)}</h2>}
              <table className="table sessions-table">
                <thead>
                  <tr>
                    <th scope="col">{t.date}</th>
                    <th scope="col">{t.columns.session}</th>
                    <th scope="col">{l.boat}</th>
                    <th scope="col">{t.columns.crew}</th>
                    <th scope="col" className="sessions-table__num">
                      {t.columns.videos}
                    </th>
                    <th scope="col" className="sessions-table__num">
                      {t.columns.forYou}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((s) => {
                    const day = formatDayParts(s.date, group.month === null);
                    const crew = crewText(s.lineup, t.cox);
                    return (
                      // The whole row opens the session; the title link is what keyboards and
                      // screen readers use.
                      <tr
                        key={s.id}
                        onClick={(e) => {
                          if (!(e.target as Element).closest('a')) openSession(s);
                        }}
                      >
                        <td className="sessions-table__date">
                          <span className="muted">{day.weekday}</span> {day.day}
                        </td>
                        <td className="sessions-table__title">
                          <a href={sessionUrl(s)} data-testid="session">
                            {s.title}
                          </a>
                          {s.clubName && <span className="muted">{s.clubName}</span>}
                          <span className="muted">
                            {s.creatorName !== null && <>{s.creatorName} · </>}
                            {t.createdOn(
                              formatCreatedDay(s.createdAt),
                              formatCreatedTime(s.createdAt),
                            )}
                          </span>
                        </td>
                        <td className="sessions-table__boat">{s.boatType ?? '—'}</td>
                        <td className="sessions-table__crew">
                          {crew ?? <span className="muted">{t.noLineup}</span>}
                        </td>
                        <td className="sessions-table__num sessions-table__videos">
                          <span className="wide-only">{s.videoCount}</span>
                          <span className="narrow-only">{t.videos(s.videoCount)}</span>
                        </td>
                        <td className="sessions-table__num sessions-table__me">
                          {s.mySeat !== null && s.boatType !== null && (
                            <span className="badge">
                              {l.seatLabel(seatRole(s.boatType, s.mySeat), s.mySeat)}
                            </span>
                          )}
                          {s.notesForMe > 0 ? (
                            <span className="badge badge--accent">
                              {t.notesForMe(s.notesForMe)}
                            </span>
                          ) : (
                            s.mySeat === null && <span className="muted wide-only">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
