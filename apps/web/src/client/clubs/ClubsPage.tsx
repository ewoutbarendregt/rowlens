import { useEffect, useState } from 'react';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { api } from '../api.ts';
import { setActiveClub } from '../club-context.ts';
import { appUrl } from '../env.ts';
import { useAuth } from '../auth/useAuth.ts';
import { clubStrings } from './strings.ts';
interface Club {
  id: string;
  name: string;
  slug: string;
  archivedAt?: string | null;
}
interface Application {
  id: string;
  clubId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
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
    [users, setUsers] = useState<User[]>([]);
  const [revision, setRevision] = useState(0),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState<Club | null>(null),
    [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [adminId, setAdminId] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState<Club | null>(null);
  const actor = state.kind === 'open' ? state.user.id : null;
  const platform = state.kind === 'open' && state.user.platformAdmin === true;
  const clubId = state.kind === 'open' ? state.club.id : null;
  useEffect(() => {
    let stale = false;
    setLoaded(false);
    setFailed(false);
    void Promise.all([
      api(platform ? '/api/platform/clubs' : '/api/account/clubs'),
      ...(platform ? [api('/api/platform/users')] : []),
    ])
      .then(async (responses) => {
        if (responses.some((r) => !r.ok)) throw new Error('unavailable');
        const data = (await Promise.all(responses.map((r) => r.json()))) as unknown[];
        if (stale) return;
        const own = data[0] as { clubs: Club[]; applications: Application[] };
        setDirectory(platform ? (data[0] as Club[]) : own.clubs);
        setApplications(platform ? [] : own.applications);
        setUsers(platform ? (data[1] as User[]) : []);
        setLoaded(true);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [revision, actor, platform, clubId]);
  if (state.kind !== 'open' || !state.unified) return null;
  const change = async (path: string, body?: unknown) => {
    setBusy(true);
    setFailed(false);
    try {
      const r = await api(path, { method: 'POST', ...(body === undefined ? {} : { body }) });
      if (!r.ok) {
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
      {!platform && !state.clubs?.length && <p>{t.none}</p>}
      <section className="card">
        <h2>{t.clubs}</h2>
        <div className="club-list">
          {directory.map((c) => {
            const member = state.clubs?.some((m) => m.id === c.id);
            const a = applications.find((a) => a.clubId === c.id);
            return (
              <article key={c.id} className="club-list__item">
                <h3>{c.name}</h3>
                {c.archivedAt ? (
                  <p>{t.archived}</p>
                ) : member ? (
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
                  <>
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
                    {archiveConfirm?.id === c.id ? (
                      <ConfirmInline
                        question={c.archivedAt ? t.restoreQuestion : t.archiveQuestion}
                        yesLabel={c.archivedAt ? t.restore : t.archive}
                        onCancel={() => {
                          setArchiveConfirm(null);
                        }}
                        onConfirm={() => {
                          setArchiveConfirm(null);
                          void change(`/api/platform/clubs/${c.id}/archive`, {
                            archived: !c.archivedAt,
                          });
                        }}
                      />
                    ) : (
                      <button
                        className="button--quiet"
                        disabled={busy}
                        onClick={() => {
                          setArchiveConfirm(c);
                        }}
                      >
                        {c.archivedAt ? t.restore : t.archive}
                      </button>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
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
            {edit && (
              <button
                type="button"
                className="button--quiet"
                disabled={busy}
                onClick={() => {
                  setEdit(null);
                  setName('');
                  setSlug('');
                  setAdminId('');
                }}
              >
                {t.cancelEdit}
              </button>
            )}
          </form>
        </section>
      )}
    </main>
  );
}
