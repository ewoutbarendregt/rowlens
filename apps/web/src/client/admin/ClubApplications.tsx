import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { refreshAuth } from '../auth/useAuth.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { clubStrings } from '../clubs/strings.ts';
interface User {
  id: string;
  name: string;
  email: string;
}
export function ClubApplications({ onChanged }: { onChanged: () => Promise<void> }) {
  const t = clubStrings();
  const [admissions, setAdmissions] = useState<User[]>([]);
  const [legacy, setLegacy] = useState<{ people: { id: string; name: string }[]; users: User[] }>({
    people: [],
    users: [],
  });
  const [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0),
    [mappingFailed, setMappingFailed] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    void Promise.all([api('/api/admin/applications'), api('/api/admin/legacy-people')])
      .then(async (responses) => {
        if (responses.some((r) => !r.ok)) throw new Error('unavailable');
        const [requests, identities] = (await Promise.all(responses.map((r) => r.json()))) as [
          User[],
          typeof legacy,
        ];
        if (stale) return;
        setAdmissions(requests);
        setLegacy(identities);
        setLoaded(true);
        setFailed(false);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [revision]);
  const change = async (path: string, body: unknown) => {
    setBusy(true);
    setFailed(false);
    setMappingFailed(false);
    try {
      const r = await api(path, { method: 'POST', body });
      if (!r.ok) {
        if (path.includes('/legacy-people/') && r.status === 409) {
          setMappingFailed(true);
          return;
        }
        throw new Error('failed');
      }
      setRevision((v) => v + 1);
      refreshAuth();
      await onChanged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {failed && <p role="alert">{t.failed}</p>}
      {!loaded && !failed && <p role="status">{t.loading}</p>}
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
      {legacy.people.length > 0 && (
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
    </>
  );
}
