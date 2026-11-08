import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth.ts';
import { LoginGate } from '../auth/LoginGate.tsx';
import { api } from '../api.ts';
import { ConfirmInline } from '../ui/ConfirmInline.tsx';
import { admissionStrings } from './admission-strings.ts';
interface Review {
  ownerId: string;
  id: string;
  name: string;
  email: string;
  status: string;
  clubName: string | null;
}
/** Keep the exact review route mounted while authenticating: no arbitrary return-to redirect. */
export function AdmissionPage() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    { state, refresh } = useAuth(),
    t = admissionStrings();
  const global = params.get('scope') === 'platform',
    club = params.get('club');
  const [review, setReview] = useState<Review | null>(null),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [confirm, setConfirm] = useState<boolean | null>(null);
  const actor = state.kind === 'open' ? state.user.id : null;
  useEffect(() => {
    let stale = false;
    setReview(null);
    setFailed(false);
    setDone(false);
    setConfirm(null);
    if (!actor || !id) return;
    const q = new URLSearchParams({ global: String(global) });
    if (!global && club) q.set('club', club);
    void api(`/api/account/admission/${id}?${q.toString()}`, { clubId: null })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const v = (await r.json()) as Review;
        if (!stale) setReview({ ...v, ownerId: actor });
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [actor, id, global, club]);
  if (state.kind === 'loading') return null;
  if (state.kind !== 'open')
    return (
      <main className="page">
        <h1>{t.title}</h1>
        <p>{t.login}</p>
        <LoginGate onAccess={refresh} unified={state.kind === 'locked' && state.unified === true} />
      </main>
    );
  const decide = async (approve: boolean) => {
    if (!id) return;
    setBusy(true);
    setConfirm(null);
    try {
      const r = await api(
        global ? `/api/account/clubless-requests/${id}` : `/api/admin/applications/${id}`,
        { method: 'POST', body: { approve }, clubId: global ? null : club },
      );
      if (!r.ok) throw new Error();
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page">
      <h1>{t.title}</h1>
      {done ? (
        <p role="status">{t.done}</p>
      ) : failed ? (
        <p role="alert">{t.unavailable}</p>
      ) : !review || review.ownerId !== actor ? (
        <p role="status">{t.loading}</p>
      ) : (
        <section className="card">
          <h2>{review.clubName ?? t.withoutClub}</h2>
          {review.name && <p>{review.name}</p>}
          <p>{review.email}</p>
          {review.status !== 'pending' ? (
            <p>{t.unavailable}</p>
          ) : confirm !== null ? (
            <ConfirmInline
              question={t.confirm}
              yesLabel={confirm ? t.accept : t.reject}
              onCancel={() => {
                setConfirm(null);
              }}
              onConfirm={() => void decide(confirm)}
            />
          ) : (
            <div className="club-actions">
              {[true, false].map((approve) => (
                <button
                  key={String(approve)}
                  disabled={busy}
                  className={
                    (params.get('decision') === 'reject' ? !approve : approve)
                      ? ''
                      : 'button--quiet'
                  }
                  onClick={() => {
                    setConfirm(approve);
                  }}
                >
                  {approve ? t.accept : t.reject}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <Link to="/users">{t.back}</Link>
    </main>
  );
}
