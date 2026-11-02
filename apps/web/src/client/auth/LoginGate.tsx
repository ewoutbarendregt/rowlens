import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../api.ts';
import { authStrings } from './strings.ts';

type Problem = 'invalid' | 'tooMany' | 'failed' | null;

export function LoginGate({ onAccess }: { onAccess: () => void }) {
  const t = authStrings();
  const id = useId();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const requestCode = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    void api('/api/auth/otp', { method: 'POST', body: { email } })
      .then((response) => {
        if (response.status === 202) setStep('code');
        else setProblem('failed');
      })
      .catch(() => {
        setProblem('failed');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const verify = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    void api('/api/auth/verify', { method: 'POST', body: { email, code } })
      .then((response) => {
        if (response.status === 204) onAccess();
        else
          setProblem(
            response.status === 429 ? 'tooMany' : response.status === 403 ? 'invalid' : 'failed',
          );
      })
      .catch(() => {
        setProblem('failed');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <section className="gate" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{step === 'email' ? t.title : t.codeTitle}</h2>
      <p>{step === 'email' ? t.intro : t.codeSent}</p>
      {step === 'email' ? (
        <form className="gate__form" onSubmit={requestCode}>
          <label htmlFor={`${id}-email`}>{t.emailLabel}</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            autoComplete="email"
            required
            maxLength={254}
          />
          <button type="submit" disabled={busy || email.trim() === ''}>
            {busy ? t.sending : t.requestCode}
          </button>
        </form>
      ) : (
        <form className="gate__form" onSubmit={verify}>
          <label htmlFor={`${id}-code`}>{t.codeLabel}</label>
          <input
            id={`${id}-code`}
            name="code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
            }}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            aria-invalid={problem === 'invalid'}
            aria-describedby={problem === null ? undefined : `${id}-problem`}
            autoFocus
          />
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? t.checking : t.verify}
          </button>
          <button
            className="button--quiet"
            type="button"
            disabled={busy}
            onClick={() => {
              setStep('email');
              setCode('');
              setProblem(null);
            }}
          >
            {t.changeEmail}
          </button>
        </form>
      )}
      {problem !== null && (
        <p id={`${id}-problem`} className="gate__problem" role="alert">
          {t[problem]}
        </p>
      )}
      <h3>{t.noticeTitle}</h3>
      <ul className="gate__notice">
        {t.notice.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
