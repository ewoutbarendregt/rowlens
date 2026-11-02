import { type SubmitEvent, useId, useState } from 'react';
import { Link } from 'react-router';
import { nameMatches } from '../../shared/names.ts';
import { api } from '../api.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { RowerPicker } from './RowerPicker.tsx';
import { rowerStrings } from './strings.ts';
import { addRower, type Rower, useRoster } from './useRoster.ts';

/** The club roster (#104): search, add, edit, archive and merge rowers and coxes. */
export function RowersPage() {
  const t = rowerStrings();
  const formId = useId();
  const [showArchived, setShowArchived] = useState(false);
  const roster = useRoster(showArchived ? 'include' : undefined);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [similar, setSimilar] = useState<Rower[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rowers = roster.rowers ?? [];
  const active = rowers.filter((r) => r.archivedAt === null);
  const shown = rowers.filter((r) => nameMatches(r.displayName, search));

  const submit = async (confirmNew: boolean) => {
    setBusy(true);
    setMessage(null);
    const result = await addRower(name, { email, confirmNew });
    setBusy(false);
    if (result.kind === 'added') {
      setName('');
      setEmail('');
      setSimilar(null);
      await roster.reload();
    } else if (result.kind === 'similar') {
      setSimilar(result.candidates);
    } else {
      setMessage(result.kind === 'email_taken' ? t.emailTaken : t.failed);
    }
  };

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit(false);
  };

  return (
    <main className="page">
      <nav className="page__nav">
        <Link to="/">{t.home}</Link> · <Link to="/sessions">{t.sessions}</Link>
      </nav>
      <h1>{t.rowers}</h1>
      <p className="muted">{t.intro}</p>
      {roster.failed && <p role="alert">{t.loadFailed}</p>}

      <form className="card form" onSubmit={onSubmit} aria-labelledby={`${formId}-h`}>
        <h2 id={`${formId}-h`}>{t.add}</h2>
        <label htmlFor={`${formId}-name`}>{t.name}</label>
        <input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSimilar(null);
          }}
          placeholder={t.namePlaceholder}
          maxLength={60}
          autoComplete="off"
          required
        />
        <label htmlFor={`${formId}-email`}>{t.email}</label>
        <input
          id={`${formId}-email`}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          aria-describedby={`${formId}-email-hint`}
          autoComplete="off"
        />
        <p id={`${formId}-email-hint`} className="muted hint">
          {t.emailHint}
        </p>
        {similar === null ? (
          <button type="submit" disabled={busy || name.trim() === ''}>
            {t.add}
          </button>
        ) : (
          <div className="picker__similar" role="group" aria-label={t.similar(name.trim())}>
            <p>{t.similar(name.trim())}</p>
            <ul className="similar-list">
              {similar.map((c) => (
                <li key={c.id}>
                  {c.displayName}
                  {c.archivedAt !== null && <span className="muted"> · {t.archived}</span>}
                </li>
              ))}
            </ul>
            <button type="button" disabled={busy} onClick={() => void submit(true)}>
              {t.addAnyway}
            </button>
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setSimilar(null);
              }}
            >
              {t.cancel}
            </button>
          </div>
        )}
        {message !== null && <p role="alert">{message}</p>}
      </form>

      <label className="search" htmlFor={`${formId}-search`}>
        <span className="visually-hidden">{t.search}</span>
        <input
          id={`${formId}-search`}
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={`${t.search}: ${t.searchPlaceholder.toLowerCase()}`}
          autoComplete="off"
        />
      </label>

      {roster.rowers !== null && rowers.length === 0 && <p className="muted">{t.none}</p>}
      {rowers.length > 0 && shown.length === 0 && <p className="muted">{t.noMatch}</p>}
      <ul className="list" data-testid="rower-list">
        {shown.map((r) => (
          <RowerRow key={r.id} rower={r} others={active} onChanged={roster.reload} />
        ))}
      </ul>

      <button
        type="button"
        className="button--quiet"
        aria-pressed={showArchived}
        onClick={() => {
          setShowArchived((v) => !v);
        }}
      >
        {showArchived ? t.hideArchived : t.showArchived}
      </button>
      {showArchived && <p className="muted">{t.archivedHint}</p>}
    </main>
  );
}

type Mode = { kind: 'view' } | { kind: 'edit' } | { kind: 'merge'; into: Rower | null };

function RowerRow({
  rower,
  others,
  onChanged,
}: {
  rower: Rower;
  others: Rower[];
  onChanged: () => Promise<void>;
}) {
  const t = rowerStrings();
  const id = useId();
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [name, setName] = useState(rower.displayName);
  const [email, setEmail] = useState(rower.email ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const archived = rower.archivedAt !== null;

  const patch = async (body: Record<string, unknown>) => {
    setMessage(null);
    const res = await api(`/api/rowers/${rower.id}`, { method: 'PATCH', body }).catch(() => null);
    if (res?.ok === true) {
      setMode({ kind: 'view' });
      await onChanged();
      return;
    }
    setMessage(res?.status === 409 ? t.emailTaken : t.failed);
  };

  const merge = async (into: Rower) => {
    setMessage(null);
    const res = await api(`/api/rowers/${rower.id}/merge`, {
      method: 'POST',
      body: { into: into.id },
    }).catch(() => null);
    if (res?.ok === true) await onChanged();
    else setMessage(t.failed);
  };

  return (
    <li className="list__item rower" data-testid="rower">
      {mode.kind === 'edit' ? (
        <form
          className="form rower__edit"
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ displayName: name, email });
          }}
        >
          <label htmlFor={`${id}-name`}>{t.name}</label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={60}
            required
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <label htmlFor={`${id}-email`}>{t.email}</label>
          <input
            id={`${id}-email`}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
          <span className="rower__actions">
            <button type="submit" disabled={name.trim() === ''}>
              {t.save}
            </button>
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setName(rower.displayName);
                setEmail(rower.email ?? '');
                setMode({ kind: 'view' });
              }}
            >
              {t.cancel}
            </button>
          </span>
        </form>
      ) : (
        <div>
          <strong>{rower.displayName}</strong>
          {(rower.email !== null || archived) && (
            <span className="muted">
              {[rower.email, archived ? t.archived : null].filter(Boolean).join(' · ')}
            </span>
          )}
          {mode.kind === 'merge' && (
            <div className="rower__merge">
              <RowerPicker
                label={t.mergeInto(rower.displayName)}
                rowers={others.filter((o) => o.id !== rower.id)}
                value={mode.into}
                onChange={(into) => {
                  setMode({ kind: 'merge', into });
                }}
                onAdded={() => void onChanged()}
              />
              {mode.into === null ? (
                <span className="muted">{t.mergeInto(rower.displayName)}…</span>
              ) : (
                <ConfirmInline
                  question={t.mergeQuestion(rower.displayName, mode.into.displayName)}
                  yesLabel={t.mergeYes}
                  onConfirm={() => {
                    if (mode.into !== null) void merge(mode.into);
                  }}
                  onCancel={() => {
                    setMode({ kind: 'view' });
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
      {mode.kind === 'view' && (
        <span className="rower__actions">
          {archived ? (
            <button
              type="button"
              className="button--quiet"
              onClick={() => void patch({ archived: false })}
            >
              {t.restore}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button--quiet"
                onClick={() => {
                  setMode({ kind: 'edit' });
                }}
              >
                {t.edit}
              </button>
              <button
                type="button"
                className="button--quiet"
                onClick={() => {
                  setMode({ kind: 'merge', into: null });
                }}
              >
                {t.merge}
              </button>
              <button
                type="button"
                className="button--quiet"
                onClick={() => void patch({ archived: true })}
              >
                {t.archive}
              </button>
            </>
          )}
        </span>
      )}
      {message !== null && <p role="alert">{message}</p>}
    </li>
  );
}
