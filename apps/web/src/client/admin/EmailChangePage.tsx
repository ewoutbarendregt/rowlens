import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { directoryStrings, managementError } from './directory-strings.ts';
export function EmailChangePage() {
  const { id } = useParams();
  const { state, refresh } = useAuth();
  const t = directoryStrings();
  const [proof, setProof] = useState<{ email: string; oldEmail: string; ownerId: string } | null>(
      null,
    ),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  const actor = state.kind === 'open' ? state.user.id : null;
  useEffect(() => {
    let stale = false;
    if (!actor || !id) return;
    void api(`/api/account/email-changes/${id}`, { clubId: null })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const v = (await r.json()) as { email: string; oldEmail: string };
        if (!stale) setProof({ ...v, ownerId: actor });
      })
      .catch(() => {
        if (!stale) setError(t.failed);
      });
    return () => {
      stale = true;
    };
  }, [id, actor, t.failed]);
  if (success)
    return (
      <main className="page">
        <h1>{t.emailChanged}</h1>
        <Link to="/">{t.login}</Link>
      </main>
    );
  return (
    <main className="page club-admin-page">
      <h1>{t.confirmCode}</h1>
      {state.kind !== 'open' ? (
        <>
          <p>{t.confirmLogin}</p>
          <Link to="/">{t.login}</Link>
        </>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {!proof && !error && <p role="status">{t.loading}</p>}
          {proof && proof.ownerId === actor && (
            <form
              className="card form"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                void api(`/api/account/email-changes/${id ?? ''}/confirm`, {
                  method: 'POST',
                  body: { code },
                  clubId: null,
                })
                  .then(async (r) => {
                    if (!r.ok) {
                      const v = (await r.json()) as { error?: string };
                      setError(managementError(v.error));
                      return;
                    }
                    setSuccess(true);
                    refresh();
                  })
                  .catch(() => {
                    setError(t.failed);
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              <p>{t.identityHint}</p>
              <p>
                {proof.oldEmail} → {proof.email}
              </p>
              <label>
                {t.code}
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                  }}
                />
              </label>
              <button disabled={busy}>{t.confirmCode}</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
