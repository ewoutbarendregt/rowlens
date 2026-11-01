import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../api.ts';
import { pilotStrings } from './strings.ts';

type Problem = 'invalid' | 'tooMany' | 'failed' | null;

/** The access-code form and the pilot notice. */
export function AccessGate({ onAccess }: { onAccess: () => void }) {
  const t = pilotStrings();
  const inputId = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    void api('/api/pilot/access', { method: 'POST', body: { code } })
      .then((res) => {
        if (res.status === 204) onAccess();
        else setProblem(res.status === 403 ? 'invalid' : res.status === 429 ? 'tooMany' : 'failed');
      })
      .catch(() => {
        setProblem('failed');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <section className="gate" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`}>{t.title}</h2>
      <p>{t.intro}</p>
      <form className="gate__form" onSubmit={submit}>
        <label htmlFor={inputId}>{t.codeLabel}</label>
        <input
          id={inputId}
          name="code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={100}
          aria-invalid={problem === 'invalid'}
          aria-describedby={problem === null ? undefined : `${inputId}-problem`}
        />
        <button type="submit" disabled={busy || code.trim() === ''}>
          {busy ? t.checking : t.submit}
        </button>
        {problem !== null && (
          <p id={`${inputId}-problem`} className="gate__problem" role="alert">
            {t[problem]}
          </p>
        )}
      </form>
      <h3>{t.noticeTitle}</h3>
      <ul className="gate__notice">
        {t.notice.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
