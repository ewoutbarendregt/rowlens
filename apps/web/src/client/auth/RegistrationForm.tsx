import { useEffect, useId, useState, type SubmitEvent } from 'react';
import { api } from '../api.ts';
import { appUrl } from '../env.ts';
import { lang } from '../i18n/language.ts';
import { authStrings } from './strings.ts';
import { registrationStrings } from './registration-strings.ts';

export function RegistrationForm({ onCancel }: { onCancel: () => void }) {
  const t = registrationStrings(),
    a = authStrings(),
    id = useId();
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true),
    [loadFailed, setLoadFailed] = useState(false),
    [revision, setRevision] = useState(0);
  const [email, setEmail] = useState(''),
    [club, setClub] = useState(''),
    [code, setCode] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<
    'failed' | 'invalid' | 'tooMany' | 'clubUnavailable' | null
  >(null);
  useEffect(() => {
    let stale = false;
    setLoading(true);
    setLoadFailed(false);
    void api('/api/auth/registration/clubs')
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = (await r.json()) as { id: string; name: string }[];
        if (!stale) setClubs(data);
      })
      .catch(() => {
        if (!stale) setLoadFailed(true);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [revision]);
  const send = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await api('/api/auth/registration/otp', {
        method: 'POST',
        body: { email, language: lang(), clubId: club === 'none' ? null : club },
      });
      if (r.status === 409) {
        setProblem('clubUnavailable');
        setClub('');
        setRevision((v) => v + 1);
        return;
      }
      if (r.status !== 202) throw new Error();
      const data = (await r.json()) as { requestId?: string };
      if (typeof data.requestId !== 'string') throw new Error();
      setRequestId(data.requestId);
    } catch {
      setProblem('failed');
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await api('/api/auth/registration/verify', {
        method: 'POST',
        body: { email, code, requestId },
      });
      if (r.status === 204) {
        window.location.assign(appUrl('/clubs'));
        return;
      }
      setProblem(
        r.status === 409
          ? 'clubUnavailable'
          : r.status === 429
            ? 'tooMany'
            : r.status === 403
              ? 'invalid'
              : 'failed',
      );
    } catch {
      setProblem('failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="gate registration" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{requestId ? t.codeTitle : t.title}</h3>
      <p className="gate__text">
        {requestId ? (
          <>
            {t.codeIntro} <strong>{email}</strong>. {t.codeHint}
          </>
        ) : (
          t.intro
        )}
      </p>
      {requestId ? (
        <form className="gate__form" onSubmit={(e) => void verify(e)}>
          <label htmlFor={`${id}-code`}>{a.codeLabel}</label>
          <input
            id={`${id}-code`}
            name="code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            autoFocus
            aria-invalid={problem === 'invalid'}
          />
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? a.checking : t.confirm}
          </button>
          <button
            type="button"
            className="button--ghost"
            disabled={busy}
            onClick={() => {
              setRequestId(null);
              setClub('');
              setCode('');
              setProblem(null);
              setRevision((v) => v + 1);
            }}
          >
            {t.back}
          </button>
        </form>
      ) : (
        <form className="gate__form" onSubmit={(e) => void send(e)}>
          <label htmlFor={`${id}-email`}>{a.emailLabel}</label>
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
          <label htmlFor={`${id}-club`}>{t.club}</label>
          <select
            id={`${id}-club`}
            value={club}
            required
            onChange={(e) => {
              setClub(e.target.value);
            }}
            disabled={loading || loadFailed}
          >
            <option value="" disabled>
              {t.choose}
            </option>
            <option value="none">{t.noClub}</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {loading && <p role="status">{t.loading}</p>}
          {loadFailed && (
            <>
              <p role="alert">{t.loadFailed}</p>
              <button
                type="button"
                onClick={() => {
                  setRevision((v) => v + 1);
                }}
              >
                {t.retry}
              </button>
            </>
          )}
          <button type="submit" disabled={busy || loading || loadFailed || !email.trim() || !club}>
            {busy ? a.sending : t.send}
          </button>
        </form>
      )}
      {problem && (
        <p className="gate__problem" role="alert">
          {problem === 'clubUnavailable' ? t.clubUnavailable : a[problem]}
        </p>
      )}
      <button type="button" className="button--ghost" disabled={busy} onClick={onCancel}>
        {t.signIn}
      </button>
    </section>
  );
}
