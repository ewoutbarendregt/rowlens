import { type SubmitEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { ROLES, type Role } from '../../shared/roles.ts';
import { api } from '../api.ts';
import { useAuth, refreshAuth } from '../auth/useAuth.ts';
import { locale } from '../i18n/language.ts';
import { settingsStrings } from '../settings/strings.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { UserSettingsEditor } from './UserSettingsEditor.tsx';
import { adminStrings } from './strings.ts';
import { ClubApplications } from './ClubApplications.tsx';

interface Entry {
  id: string | null;
  userId: string | null;
  email: string;
  roles: Role[];
  firstName: string | null;
  lastName: string | null;
  source: 'app' | 'server';
  joinedAt: string | null;
  lastSeenAt: string | null;
}
const errorText = (t: ReturnType<typeof adminStrings>, error: string | undefined) =>
  error === 'account_required'
    ? t.accountRequired
    : error === 'exists'
      ? t.exists
      : error === 'server_managed'
        ? t.serverManaged
        : error === 'self'
          ? t.self
          : error === 'last_admin'
            ? t.lastAdmin
            : error === 'access_changed'
              ? settingsStrings().conflict
              : t.failed;
const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

function RoleChoices({
  value,
  onChange,
  disabled = false,
  root = false,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
  root?: boolean;
}) {
  const t = adminStrings();
  return (
    <fieldset className="role-choices">
      <legend>{settingsStrings().roles}</legend>
      {ROLES.map((role) => (
        <label key={role}>
          <input
            type="checkbox"
            checked={value.includes(role)}
            disabled={disabled || (root && role === 'admin')}
            onChange={(event) => {
              onChange(
                ROLES.filter((r) => (r === role ? event.target.checked : value.includes(r))),
              );
            }}
          />
          {t.roles[role]}
        </label>
      ))}
    </fieldset>
  );
}

export function AccessPage({ directory = false }: { directory?: boolean }) {
  const t = adminStrings();
  const s = settingsStrings();
  const { state } = useAuth();
  const formId = useId();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string; email: string }[]>([]);
  const unified = state.kind === 'open' && state.unified === true;
  const platform = directory && state.kind === 'open' && state.user.platformAdmin === true;
  const clubId = state.kind === 'open' ? state.club.id : null;
  const actor = state.kind === 'open' ? state.user.id : null;
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Role[]>(['rower']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const [tab, setTab] = useState<'users' | 'roles' | 'applications'>(
    directory || !unified ? 'users' : 'applications',
  );
  const [search, setSearch] = useState('');
  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const [response, globalResponse] = await Promise.all([
        !unified || clubId ? api('/api/admin/users') : Promise.resolve(null),
        platform ? api('/api/platform/users') : Promise.resolve(null),
      ]);
      if ((response && !response.ok) || (globalResponse && !globalResponse.ok)) throw new Error();
      const [members, global] = await Promise.all([
        response
          ? (response.json() as Promise<{ entries: Entry[] }>)
          : Promise.resolve({ entries: [] }),
        globalResponse
          ? (globalResponse.json() as Promise<{ id: string; name: string; email: string }[]>)
          : Promise.resolve([]),
      ]);
      if (generation !== loadGeneration.current) return;
      setEntries(members.entries);
      setAccounts(global);
      setFailed(false);
    } catch {
      if (generation === loadGeneration.current) setFailed(true);
    }
  }, [platform, clubId, unified, actor]);
  const admin = state.kind === 'open' && state.user.roles.includes('admin');
  const AdmissionContainer = directory ? 'details' : 'div';
  useEffect(() => {
    if (admin) void load();
    return () => {
      loadGeneration.current++;
    };
  }, [admin, load]);
  if (state.kind === 'loading') return null;
  if (!admin) return <Navigate to="/" replace />;
  const admit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const address = email.trim().toLowerCase();
    const response = await api('/api/admin/access', {
      method: 'POST',
      body: { email: address, roles },
    }).catch(() => null);
    setBusy(false);
    if (response?.status === 201) {
      const { invited } = (await response.json()) as { invited: boolean };
      setMessage({
        text: unified
          ? t.admittedClub(address)
          : invited
            ? t.admitted(address)
            : t.admittedNoMail(address),
        alert: !unified && !invited,
      });
      setEmail('');
      await load();
      return;
    }
    const error =
      response === null
        ? undefined
        : ((await response.json().catch(() => ({}))) as { error?: string }).error;
    setMessage({ text: errorText(t, error), alert: true });
  };
  return (
    <main className="page club-admin-page">
      <h1>{directory ? t.users : t.admin}</h1>
      {!directory && (
        <div className="tabs" role="tablist" aria-label={t.admin}>
          {(unified ? (['applications', 'roles'] as const) : (['users', 'roles'] as const)).map(
            (name) => (
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
                {unified && name === 'users' ? t.members : t.tabs[name]}
              </button>
            ),
          )}
        </div>
      )}
      {tab === 'applications' ? (
        <section
          role="tabpanel"
          id={`${formId}-panel-applications`}
          aria-labelledby={`${formId}-tab-applications`}
        >
          <ClubApplications onChanged={load} />
        </section>
      ) : tab === 'roles' ? (
        <section
          role="tabpanel"
          id={`${formId}-panel-roles`}
          aria-labelledby={`${formId}-tab-roles`}
          data-testid="roles"
        >
          <p className="muted">{t.rolesIntro}</p>
          {unified && <p>{t.platformRoleHint}</p>}
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
                {t.rights
                  .filter((r) => !unified || !('legacyRoster' in r))
                  .map((right) => (
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
          role={directory ? undefined : 'tabpanel'}
          id={`${formId}-panel-users`}
          aria-labelledby={directory ? undefined : `${formId}-tab-users`}
        >
          <p className="muted">
            {directory
              ? platform
                ? t.allAccounts
                : t.clubAccounts
              : unified
                ? t.unifiedIntro
                : t.intro}
          </p>
          {directory && clubId && <p>{t.roleScope(state.club.name)}</p>}
          {failed && <p role="alert">{t.loadFailed}</p>}
          {entries === null && !failed && <p role="status">{t.loadingUsers}</p>}
          {(!unified || clubId) && (
            <AdmissionContainer className={directory ? 'card users-admission' : undefined}>
              {directory && <summary>{t.admit}</summary>}
              <form
                className={directory ? 'form' : 'card form'}
                onSubmit={(event) => void admit(event)}
                aria-labelledby={`${formId}-h`}
              >
                <h2 id={`${formId}-h`}>{t.admit}</h2>
                <label htmlFor={`${formId}-email`}>{t.email}</label>
                <input
                  id={`${formId}-email`}
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                  autoComplete="off"
                  required
                />
                <RoleChoices value={roles} onChange={setRoles} disabled={busy} />
                <button type="submit" disabled={busy || email.trim() === '' || roles.length === 0}>
                  {t.admit}
                </button>
                {roles.length === 0 && <p>{s.needRole}</p>}
                {message && <p role={message.alert ? 'alert' : 'status'}>{message.text}</p>}
              </form>
            </AdmissionContainer>
          )}
          {!directory && <h2>{unified ? t.members : t.people}</h2>}
          <div className="form">
            <label htmlFor={`${formId}-search`}>{s.search}</label>
            <input
              id={`${formId}-search`}
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <ul className="list" data-testid="access-list">
            {(platform
              ? accounts.map((account) => ({
                  account,
                  member: entries?.find((e) => e.userId === account.id),
                }))
              : (entries ?? []).map((member) => ({
                  account: {
                    id: member.userId ?? member.email,
                    name: [member.firstName, member.lastName].filter(Boolean).join(' '),
                    email: member.email,
                  },
                  member,
                }))
            )
              .filter(({ account }) =>
                `${account.email} ${account.name}`
                  .toLocaleLowerCase()
                  .includes(search.trim().toLocaleLowerCase()),
              )
              .map(({ account, member }) =>
                member ? (
                  <AccessRow
                    key={account.id}
                    entry={member}
                    onChanged={load}
                    ownId={state.user.id}
                    unified={unified}
                  />
                ) : (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onChanged={load}
                    hasClub={!!clubId}
                  />
                ),
              )}
          </ul>
        </section>
      )}
    </main>
  );
}
function AccessRow({
  entry,
  onChanged,
  ownId,
  unified,
}: {
  entry: Entry;
  onChanged: () => Promise<void>;
  ownId: string;
  unified: boolean;
}) {
  const t = adminStrings();
  const s = settingsStrings();
  const [open, setOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<{ roles: Role[]; expectedRoles: Role[] } | null>(null);
  const roles = roleDraft?.roles ?? entry.roles;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = entry.source === 'server' && entry.roles.includes('admin');
  const changed = roleDraft !== null && roles.join(',') !== roleDraft.expectedRoles.join(',');
  const change = async (method: 'PATCH' | 'DELETE' | 'POST') => {
    setError(null);
    setBusy(true);
    const response = await api(
      method === 'POST' ? '/api/admin/access' : `/api/admin/access/${entry.id ?? ''}`,
      {
        method,
        body:
          method === 'DELETE'
            ? undefined
            : method === 'POST'
              ? { email: entry.email, roles }
              : { roles, expectedRoles: roleDraft?.expectedRoles ?? entry.roles },
      },
    ).catch(() => null);
    setBusy(false);
    if (response?.ok === true) {
      await onChanged();
      setRoleDraft(null);
      if (entry.userId === ownId) refreshAuth();
      return;
    }
    const code =
      response === null
        ? undefined
        : ((await response.json().catch(() => ({}))) as { error?: string }).error;
    setError(errorText(t, code));
  };
  return (
    <li className="list__item access" data-testid="access">
      <div className="access__identity">
        <strong>
          {[entry.firstName, entry.lastName].filter(Boolean).join(' ') || entry.email}
        </strong>
        {(entry.firstName || entry.lastName) && <span>{entry.email}</span>}
        <span className="muted">
          {[
            entry.source === 'server' ? t.server : null,
            entry.lastSeenAt === null
              ? unified && entry.userId !== null
                ? t.activityUnknown
                : t.notYet
              : t.lastSeen(formatWhen(entry.lastSeenAt)),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span>
          {entry.roles.map((role) => (
            <span className="badge" key={role}>
              {t.roles[role]}
            </span>
          ))}
        </span>
      </div>
      <div className="access__actions">
        <button
          type="button"
          className="button--quiet"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {s.settings}
        </button>
        {entry.source === 'app' &&
          entry.id !== null &&
          (confirming ? (
            <ConfirmInline
              question={unified ? t.confirmRemoveClub(entry.email) : t.confirmRemove(entry.email)}
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
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t.remove}
            </button>
          ))}
      </div>
      {open && (
        <div className="access__settings">
          <RoleChoices
            value={roles}
            onChange={(next) => {
              setRoleDraft((current) => ({
                roles: next,
                expectedRoles: current?.expectedRoles ?? entry.roles,
              }));
            }}
            disabled={busy}
            root={root}
          />
          {roles.length === 0 && <p>{s.needRole}</p>}
          <div className="form__actions">
            <button
              type="button"
              disabled={busy || !changed || roles.length === 0}
              onClick={() => void change(entry.id === null ? 'POST' : 'PATCH')}
            >
              {s.save}
            </button>
            <button
              type="button"
              className="button--quiet"
              disabled={busy}
              onClick={() => {
                setRoleDraft(null);
                setError(null);
              }}
            >
              {s.cancel}
            </button>
          </div>
          {entry.userId === null ? (
            <p className="muted">{s.noAccount}</p>
          ) : (
            <UserSettingsEditor
              userId={entry.userId}
              name={[entry.firstName, entry.lastName].filter(Boolean).join(' ') || entry.email}
              onSaved={() => {
                void onChanged();
                if (entry.userId === ownId) refreshAuth();
              }}
            />
          )}
        </div>
      )}
      {error && (
        <p role="alert">
          {error}
          <button
            type="button"
            className="button--quiet"
            onClick={() => {
              void onChanged();
              setRoleDraft(null);
              setError(null);
            }}
          >
            {s.reload}
          </button>
        </p>
      )}
    </li>
  );
}

function AccountRow({
  account,
  onChanged,
  hasClub,
}: {
  account: { id: string; name: string; email: string };
  onChanged: () => Promise<void>;
  hasClub: boolean;
}) {
  const t = adminStrings();
  const s = settingsStrings();
  const [open, setOpen] = useState(false);
  return (
    <li className="list__item access" data-testid="access">
      <div className="access__identity">
        <strong>{account.name || account.email}</strong>
        <span>{account.email}</span>
        <span className="muted">{hasClub ? t.outsideClub : t.accountOnly}</span>
      </div>
      <div className="access__actions">
        <button
          type="button"
          className="button--quiet"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {s.settings}
        </button>
      </div>
      {open && (
        <div className="access__settings">
          <UserSettingsEditor
            userId={account.id}
            name={account.name || account.email}
            onSaved={() => {
              void onChanged();
            }}
          />
        </div>
      )}
    </li>
  );
}
