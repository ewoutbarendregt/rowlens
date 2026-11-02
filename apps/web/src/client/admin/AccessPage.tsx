import { type SubmitEvent, useCallback, useEffect, useId, useState } from 'react';
import { Navigate } from 'react-router';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { locale } from '../i18n/language.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { adminStrings } from './strings.ts';

type Role = 'rower' | 'coach' | 'admin';
const ROLES: Role[] = ['rower', 'coach', 'admin'];

interface Entry {
  id: string | null;
  email: string;
  role: Role;
  source: 'app' | 'server';
  joinedAt: string | null;
  lastSeenAt: string | null;
}

const errorText = (t: ReturnType<typeof adminStrings>, error: string | undefined) =>
  error === 'exists'
    ? t.exists
    : error === 'server_managed'
      ? t.serverManaged
      : error === 'self'
        ? t.self
        : error === 'last_admin'
          ? t.lastAdmin
          : t.failed;

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat(locale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

/** Admin → Access (#42): give people access with a role, change roles, remove access. */
export function AccessPage() {
  const t = adminStrings();
  const { state } = useAuth();
  const formId = useId();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('rower');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const [tab, setTab] = useState<'users' | 'roles'>('users');

  const load = useCallback(async () => {
    try {
      const res = await api('/api/admin/access');
      if (!res.ok) throw new Error();
      setEntries(((await res.json()) as { entries: Entry[] }).entries);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (state.kind === 'open' && state.user.role === 'admin') void load();
  }, [state, load]);

  if (state.kind === 'loading') return null;
  if (state.kind !== 'open' || state.user.role !== 'admin') return <Navigate to="/" replace />;

  const admit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const address = email.trim().toLowerCase();
    const res = await api('/api/admin/access', {
      method: 'POST',
      body: { email: address, role },
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 201) {
      const { invited } = (await res.json()) as { invited: boolean };
      setMessage({
        text: invited ? t.admitted(address) : t.admittedNoMail(address),
        alert: !invited,
      });
      setEmail('');
      await load();
      return;
    }
    const error =
      res === null ? undefined : ((await res.json().catch(() => ({}))) as { error?: string }).error;
    setMessage({ text: errorText(t, error), alert: true });
  };

  return (
    <main className="page">
      <h1>{t.admin}</h1>
      <div className="tabs" role="tablist" aria-label={t.admin}>
        {(['users', 'roles'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${formId}-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`${formId}-panel-${name}`}
            className="tabs__tab"
            onClick={() => {
              setTab(name);
            }}
          >
            {t.tabs[name]}
          </button>
        ))}
      </div>

      {tab === 'roles' ? (
        <section
          role="tabpanel"
          id={`${formId}-panel-roles`}
          aria-labelledby={`${formId}-tab-roles`}
          data-testid="roles"
        >
          <p className="muted">{t.rolesIntro}</p>
          <div className="table-wrap">
            <table className="roles-table">
              <thead>
                <tr>
                  <th scope="col">{t.can}</th>
                  {ROLES.map((r) => (
                    <th key={r} scope="col">
                      {t.roles[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rights.map((right) => (
                  <tr key={right.what}>
                    <th scope="row">{right.what}</th>
                    {ROLES.map((r) => (
                      <td key={r}>{right[r]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section
          role="tabpanel"
          id={`${formId}-panel-users`}
          aria-labelledby={`${formId}-tab-users`}
        >
          <p className="muted">{t.intro}</p>
          {failed && <p role="alert">{t.loadFailed}</p>}

          <form
            className="card form"
            onSubmit={(e) => void admit(e)}
            aria-labelledby={`${formId}-h`}
          >
            <h2 id={`${formId}-h`}>{t.admit}</h2>
            <label htmlFor={`${formId}-email`}>{t.email}</label>
            <input
              id={`${formId}-email`}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              autoComplete="off"
              required
            />
            <label htmlFor={`${formId}-role`}>{t.role}</label>
            <select
              id={`${formId}-role`}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy || email.trim() === ''}>
              {t.admit}
            </button>
            {message !== null && <p role={message.alert ? 'alert' : 'status'}>{message.text}</p>}
          </form>

          <h2>{t.people}</h2>
          <ul className="list" data-testid="access-list">
            {(entries ?? []).map((entry) => (
              <AccessRow key={entry.email} entry={entry} onChanged={load} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function AccessRow({ entry, onChanged }: { entry: Entry; onChanged: () => Promise<void> }) {
  const t = adminStrings();
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = entry.source === 'app' && entry.id !== null;

  const change = async (method: 'PATCH' | 'DELETE', body?: unknown) => {
    setError(null);
    const res = await api(`/api/admin/access/${entry.id ?? ''}`, { method, body }).catch(
      () => null,
    );
    if (res?.ok === true) {
      await onChanged();
      return;
    }
    const code =
      res === null ? undefined : ((await res.json().catch(() => ({}))) as { error?: string }).error;
    setError(errorText(t, code));
  };

  return (
    <li className="list__item access" data-testid="access">
      <div>
        <strong>{entry.email}</strong>
        <span className="muted">
          {[
            entry.source === 'server' ? t.server : null,
            entry.lastSeenAt === null ? t.notYet : t.lastSeen(formatWhen(entry.lastSeenAt)),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="access__actions">
        {editable ? (
          <>
            <label htmlFor={`${id}-role`} className="visually-hidden">
              {t.changeRole(entry.email)}
            </label>
            <select
              id={`${id}-role`}
              value={entry.role}
              onChange={(e) => void change('PATCH', { role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </select>
            {confirming ? (
              <ConfirmInline
                question={t.confirmRemove(entry.email)}
                yesLabel={t.removeYes}
                onConfirm={() => {
                  setConfirming(false);
                  void change('DELETE');
                }}
                onCancel={() => {
                  setConfirming(false);
                }}
              />
            ) : (
              <button
                type="button"
                className="button--quiet"
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {t.remove}
              </button>
            )}
          </>
        ) : (
          <span className="badge">{t.roles[entry.role]}</span>
        )}
      </div>
      {error !== null && <p role="alert">{error}</p>}
    </li>
  );
}
