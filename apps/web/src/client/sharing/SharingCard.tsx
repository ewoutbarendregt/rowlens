import { useEffect, useId, useState } from 'react';
import { api } from '../api.ts';
import {
  sessionSharingSchema,
  sharingMembersSchema,
  type SessionSharing,
  type ShareMember,
} from '../../shared/session-sharing.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { sharingStrings } from './strings.ts';
export function SharingCard({ sessionId, clubName }: { sessionId: string; clubName: string }) {
  const t = sharingStrings(),
    id = useId();
  const [saved, setSaved] = useState<SessionSharing | null>(null);
  const [clubWide, setClubWide] = useState(false),
    [selected, setSelected] = useState<ShareMember[]>([]);
  const [version, setVersion] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed' | 'conflict' | 'invalid'>(
    'idle',
  );
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<ShareMember[]>([]),
    [more, setMore] = useState(false),
    [searchFailed, setSearchFailed] = useState(false),
    [searching, setSearching] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setStatus('idle');
    void api(`/api/sessions/${sessionId}/sharing`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const body = sessionSharingSchema.parse(await r.json());
        if (!stale) {
          setSaved(body);
          setClubWide(body.clubWide);
          setSelected(body.members);
          setQuery('');
          setConfirm(false);
        }
      })
      .catch(() => {
        if (!stale) setStatus('failed');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [sessionId, version]);
  useEffect(() => {
    let stale = false;
    setResults([]);
    setMore(false);
    setSearchFailed(false);
    if (query.trim().length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams({ q: query.trim() });
      void api(`/api/sessions/${sessionId}/sharing/members?${search.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const data = sharingMembersSchema.parse(await r.json());
          if (!stale) {
            setResults(data.members);
            setMore(data.more);
          }
        })
        .catch(() => {
          if (!stale) setSearchFailed(true);
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 200);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, query]);
  const dirty =
    saved !== null &&
    (clubWide !== saved.clubWide ||
      selected.length !== saved.members.length ||
      selected.some((m) => !saved.members.some((s) => s.id === m.id)));
  const save = async (all = clubWide, members = selected) => {
    if (saved === null || busy) return;
    setBusy(true);
    setStatus('idle');
    setConfirm(false);
    try {
      const r = await api(`/api/sessions/${sessionId}/sharing`, {
        method: 'PUT',
        body: { revision: saved.revision, clubWide: all, userIds: members.map((m) => m.id) },
      });
      if (r.status === 409) {
        setStatus('conflict');
        return;
      }
      if (r.status === 400) {
        setStatus('invalid');
        return;
      }
      if (!r.ok) throw new Error();
      const result = sessionSharingSchema.parse(await r.json());
      setSaved(result);
      setClubWide(result.clubWide);
      setSelected(result.members);
      setQuery('');
      setStatus('saved');
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };
  const name = (m: ShareMember) => m.name ?? t.unknown;
  const reload = (
    <button
      type="button"
      className="button--quiet"
      disabled={busy || loading}
      onClick={() => {
        setVersion((v) => v + 1);
      }}
    >
      {t.reload}
    </button>
  );
  return (
    <details className="card session-sharing" data-testid="training-sharing">
      <summary>
        {t.sharing}
        {saved && (
          <span className="muted">
            {' '}
            ·{' '}
            {saved.clubWide
              ? t.all
              : saved.members.length
                ? t.selected(saved.members.length)
                : t.none}
          </span>
        )}
      </summary>
      {loading && <p role="status">{t.loading}</p>}
      {status === 'failed' && (
        <p role="alert">
          {t.failed} {reload}
        </p>
      )}
      {saved && !loading && (
        <div className="form">
          <p className="muted">
            {t.club}: {clubName}
          </p>
          <p>{t.intro}</p>
          {saved.isExample && <p className="callout">{t.exampleAudience}</p>}
          <label className="filters__check">
            <input
              type="checkbox"
              checked={clubWide}
              disabled={busy}
              onChange={(e) => {
                setClubWide(e.target.checked);
                setStatus((s) => (s === 'conflict' || s === 'invalid' ? s : 'idle'));
              }}
            />
            {t.all}
          </label>
          <p className="muted">{t.clubHint}</p>
          <h2>{t.members}</h2>
          <ul className="session-sharing__selected">
            {selected.map((m) => (
              <li key={m.id}>
                <span>{name(m)}</span>
                <button
                  type="button"
                  className="button--quiet"
                  disabled={busy}
                  aria-label={t.remove(name(m))}
                  onClick={() => {
                    setSelected((s) => s.filter((r) => r.id !== m.id));
                    setStatus((s) => (s === 'conflict' || s === 'invalid' ? s : 'idle'));
                  }}
                >
                  {t.remove(name(m))}
                </button>
              </li>
            ))}
          </ul>
          <label htmlFor={`${id}-search`}>{t.search}</label>
          <input
            type="search"
            id={`${id}-search`}
            value={query}
            maxLength={80}
            disabled={busy}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            aria-describedby={`${id}-hint`}
          />
          <p id={`${id}-hint`} className="muted">
            {t.searchHint}
          </p>
          {searchFailed && <p role="alert">{t.searchFailed}</p>}
          {query.trim().length >= 2 && !searching && !searchFailed && results.length === 0 && (
            <p>{t.noMatches}</p>
          )}
          <ul className="session-sharing__results" aria-busy={searching}>
            {results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="button--quiet"
                  disabled={busy || selected.some((s) => s.id === m.id) || selected.length >= 500}
                  onClick={() => {
                    setSelected((s) => [...s, m]);
                    setQuery('');
                    setStatus((s) => (s === 'conflict' || s === 'invalid' ? s : 'idle'));
                  }}
                >
                  {t.add(name(m))}
                </button>
              </li>
            ))}
          </ul>
          {more && <p className="muted">{t.more}</p>}
          <p className="muted">{t.accessRemains}</p>
          <div className="form__actions">
            <button
              type="button"
              disabled={busy || !dirty || status === 'conflict' || status === 'invalid'}
              onClick={() => {
                void save();
              }}
            >
              {t.save}
            </button>
            {(saved.clubWide || saved.members.length > 0) && !confirm && (
              <button
                type="button"
                className="button--quiet"
                disabled={busy || status === 'conflict' || status === 'invalid'}
                onClick={() => {
                  setConfirm(true);
                }}
              >
                {t.stop}
              </button>
            )}
          </div>
          {confirm && (
            <ConfirmInline
              question={t.stopQuestion}
              yesLabel={t.confirmStop}
              onConfirm={() => {
                void save(false, []);
              }}
              onCancel={() => {
                setConfirm(false);
              }}
            />
          )}
          {status === 'saved' && <p role="status">{t.saved}</p>}
          {(status === 'conflict' || status === 'invalid') && (
            <p role="alert">
              {status === 'conflict' ? t.conflict : t.invalid} {reload}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
