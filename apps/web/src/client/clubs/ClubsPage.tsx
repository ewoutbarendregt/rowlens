import { useEffect, useState } from 'react';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { api } from '../api.ts';
import { setActiveClub } from '../club-context.ts';
import { appUrl } from '../env.ts';
import { useAuth } from '../auth/useAuth.ts';
import { UserSettingsEditor } from '../admin/UserSettingsEditor.tsx';
import { clubStrings } from './strings.ts';
interface Club {
  id: string;
  name: string;
  slug: string;
}
interface Application {
  id: string;
  clubId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}
interface Admission {
  id: string;
  name: string;
  email: string;
}
interface User {
  id: string;
  name: string;
  email: string;
}
export function ClubsPage() {
  const { state, refresh } = useAuth();
  const t = clubStrings();
  const [directory, setDirectory] = useState<Club[]>([]),
    [applications, setApplications] = useState<Application[]>([]),
    [admissions, setAdmissions] = useState<Admission[]>([]),
    [users, setUsers] = useState<User[]>([]);
  const [revision, setRevision] = useState(0),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState<Club | null>(null),
    [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [adminId, setAdminId] = useState(''),
    [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [legacy, setLegacy] = useState<{ people: { id: string; name: string }[]; users: User[] }>({
    people: [],
    users: [],
  });
  const [mappingFailed, setMappingFailed] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const actor = state.kind === 'open' ? state.user.id : null;
  const platform = state.kind === 'open' && state.user.platformAdmin === true;
  const admin = state.kind === 'open' && state.user.roles.includes('admin') && !!state.club.id;
  const clubId = state.kind === 'open' ? state.club.id : null;
  useEffect(() => {
    let stale = false;
    setLoaded(false);
    setFailed(false);
    void Promise.all([
      api('/api/account/clubs'),
      ...(admin ? [api('/api/admin/applications')] : []),
      ...(platform ? [api('/api/platform/users')] : []),
      ...(admin ? [api('/api/admin/legacy-people')] : []),
    ])
      .then(async (responses) => {
        if (responses.some((r) => !r.ok)) throw new Error('unavailable');
        const data = (await Promise.all(responses.map((r) => r.json()))) as unknown[];
        if (stale) return;
        const own = data[0] as { clubs: Club[]; applications: Application[] };
        setDirectory(own.clubs);
        setApplications(own.applications);
        setAdmissions(admin ? (data[1] as Admission[]) : []);
        setUsers(platform ? (data[admin ? 2 : 1] as User[]) : []);
        if (admin) setLegacy(data[platform ? 3 : 2] as typeof legacy);
        setLoaded(true);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [revision, actor, admin, platform, clubId]);
  if (state.kind !== 'open' || !state.unified) return null;
  const change = async (path: string, body?: unknown) => {
    setBusy(true);
    setFailed(false);
    setMappingFailed(false);
    try {
      const r = await api(path, { method: 'POST', ...(body === undefined ? {} : { body }) });
      if (!r.ok) {
        if (path.startsWith('/api/admin/legacy-people/') && r.status === 409) {
          setMappingFailed(true);
          return false;
        }
        throw new Error('failed');
      }
      setRevision((v) => v + 1);
      refresh();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const open = (id: string) => {
    setActiveClub(id);
    window.location.assign(appUrl('/sessions'));
  };
  return (
    <main className="page clubs-page">
      <h1>{t.clubs}</h1>
      {failed && <p role="alert">{t.failed}</p>}
      {!loaded && !failed && <p role="status">{t.loading}</p>}
      <p>{t.switchHint}</p>
      {!state.clubs?.length && <p>{t.none}</p>}
      <section className="card">
        <h2>{t.clubs}</h2>
        <div className="club-list">
          {directory.map((c) => {
            const member = state.clubs?.some((m) => m.id === c.id);
            const a = applications.find((a) => a.clubId === c.id);
            return (
              <article key={c.id} className="club-list__item">
                <h3>{c.name}</h3>
                {member ? (
                  <button
                    type="button"
                    onClick={() => {
                      open(c.id);
                    }}
                  >
                    {c.id === state.club.id ? t.current : t.enter}
                  </button>
                ) : (
                  <>
                    {a && <p>{t[a.status]}</p>}
                    {a?.status === 'pending' ? (
                      <button
                        disabled={busy}
                        onClick={() => void change(`/api/account/applications/${a.id}/cancel`)}
                      >
                        {t.cancel}
                      </button>
                    ) : (
                      <button
                        disabled={busy || a?.status === 'approved'}
                        onClick={() => void change('/api/account/applications', { clubId: c.id })}
                      >
                        {t.apply}
                      </button>
                    )}
                  </>
                )}
                {platform && (
                  <button
                    className="button--quiet"
                    onClick={() => {
                      setEdit(c);
                      setName(c.name);
                      setSlug(c.slug);
                      setAdminId('');
                    }}
                  >
                    {t.edit}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
      {admin && (
        <section className="card">
          <h2>{t.applications}</h2>
          {loaded && !admissions.length && <p>{t.empty}</p>}
          {admissions.map((a) => (
            <article key={a.id} className="club-list__item">
              <h3>{a.name}</h3>
              <p>{a.email}</p>
              <div className="club-actions">
                <button
                  disabled={busy}
                  onClick={() => void change(`/api/admin/applications/${a.id}`, { approve: true })}
                >
                  {t.approve}
                </button>
                <button
                  disabled={busy}
                  className="button--quiet"
                  onClick={() => void change(`/api/admin/applications/${a.id}`, { approve: false })}
                >
                  {t.reject}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {admin && legacy.people.length > 0 && (
        <section className="card">
          <h2>{t.legacy}</h2>
          <p>{t.legacyHint}</p>
          {mappingFailed && <p role="alert">{t.mappingConflict}</p>}
          {legacy.people.map((p) => (
            <article key={p.id} className="club-list__item">
              <h3>{p.name}</h3>
              <label>
                {t.chooseUser}
                <select
                  aria-label={t.chooseUser}
                  value={mapping[p.id] ?? ''}
                  onChange={(e) => {
                    setMapping({ ...mapping, [p.id]: e.target.value });
                  }}
                >
                  <option value="">{t.choose}</option>
                  {legacy.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              {confirm === p.id ? (
                <ConfirmInline
                  question={t.linkedQuestion}
                  yesLabel={t.link}
                  onCancel={() => {
                    setConfirm(null);
                  }}
                  onConfirm={() => {
                    setConfirm(null);
                    void change(`/api/admin/legacy-people/${p.id}`, { userId: mapping[p.id] });
                  }}
                />
              ) : (
                <button
                  disabled={busy || !mapping[p.id]}
                  onClick={() => {
                    setConfirm(p.id);
                  }}
                >
                  {t.link}
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {platform && (
        <section className="card">
          <h2>{t.platform}</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void change('/api/platform/clubs', {
                id: edit?.id ?? null,
                name,
                slug,
                adminId: adminId || null,
              }).then((ok) => {
                if (ok) {
                  setEdit(null);
                  setName('');
                  setSlug('');
                  setAdminId('');
                }
              });
            }}
          >
            <label>
              {t.name}
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </label>
            <label>
              {t.slug}
              <input
                required
                pattern="[a-z0-9-]{1,64}"
                disabled={edit !== null}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                }}
              />
            </label>
            <label>
              {t.initialAdmin}
              <select
                aria-label={t.initialAdmin}
                value={adminId}
                onChange={(e) => {
                  setAdminId(e.target.value);
                }}
                required={!edit}
              >
                <option value="">{t.choose}</option>
                {users.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>{edit ? t.save : t.create}</button>
          </form>
          <h3>{t.users}</h3>
          <label>
            {t.profile}
            <select
              aria-label={t.profile}
              value={selectedUser?.id ?? ''}
              onChange={(e) => {
                setSelectedUser(users.find((u) => u.id === e.target.value) ?? null);
              }}
            >
              <option value="">{t.choose}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </label>
          {selectedUser && (
            <UserSettingsEditor
              userId={selectedUser.id}
              name={selectedUser.name || selectedUser.email}
              onSaved={() => {
                setRevision((v) => v + 1);
              }}
            />
          )}
        </section>
      )}
    </main>
  );
}
