import { RegistrationForm } from './RegistrationForm.tsx';
import { registrationStrings } from './registration-strings.ts';
import { type SubmitEvent, useId, useState } from 'react';
import { lang } from '../i18n/language.ts';
import { api } from '../api.ts';
import { Icon } from '../ui/icons.tsx';
import { authStrings } from './strings.ts';

type Problem = 'invalid' | 'tooMany' | 'failed' | null;

export function LoginGate({
  onAccess,
  unified = false,
}: {
  onAccess: () => void;
  unified?: boolean;
}) {
  const t = authStrings();
  const [register, setRegister] = useState(false);
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
    void api('/api/auth/otp', { method: 'POST', body: { email, language: lang() } })
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

  if (unified && register)
    return (
      <RegistrationForm
        onCancel={() => {
          setRegister(false);
        }}
      />
    );
  return (
    <section className="gate" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{step === 'email' ? t.title : t.codeTitle}</h3>
      {step === 'email' ? (
        <p className="gate__text">{unified ? registrationStrings().loginIntro : t.intro}</p>
      ) : (
        <p className="gate__text">
          {unified ? registrationStrings().loginMailIf : t.codeSentIf} <strong>{email}</strong>{' '}
          {unified ? registrationStrings().loginMailRest : t.codeSentRest}
        </p>
      )}
      {step === 'email' ? (
        <form className="gate__form" onSubmit={requestCode}>
          <label className="gate__label" htmlFor={`${id}-email`}>
            {t.emailLabel}
          </label>
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
            <Icon name="mail" />
            {busy ? t.sending : t.requestCode}
          </button>
        </form>
      ) : (
        <form className="gate__form" onSubmit={verify}>
          <label className="gate__label" htmlFor={`${id}-code`}>
            {t.codeLabel}
          </label>
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
          {problem !== null && (
            <p id={`${id}-problem`} className="gate__problem" role="alert">
              <Icon name="alert" />
              {t[problem]}
            </p>
          )}
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? t.checking : t.verify}
          </button>
          <button
            className="button--ghost"
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
          <p className="gate__footnote">{t.thirtyDays}</p>
        </form>
      )}
      {step === 'email' && problem !== null && (
        <p id={`${id}-problem`} className="gate__problem" role="alert">
          <Icon name="alert" />
          {t[problem]}
        </p>
      )}
      {unified && (
        <>
          <button
            type="button"
            className="button--ghost"
            disabled={busy}
            onClick={() => {
              setRegister(true);
            }}
          >
            {registrationStrings().create}
          </button>
        </>
      )}
      <h4 className="gate__notice-title">{t.noticeTitle}</h4>
      <ol className="gate__notice">
        {t.notice.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </section>
  );
}
