import { type SubmitEvent, useId, useState } from 'react';
import { BOAT_CLASS_NAMES, type BoatClass } from '../../shared/boats.ts';
import { api } from '../api.ts';
import { authStrings } from '../auth/strings.ts';

/** The boat a new session starts with when the member hasn't chosen one (Ewout, 2026-11-03). */
export const DEFAULT_BOAT: BoatClass = 'C4x+';

interface ProfileFormProps {
  firstName: string | null;
  lastName: string | null;
  defaultBoatType: BoatClass | null;
  /** The account menu shows the boat too; the first-time card only asks for the name. */
  withBoat: boolean;
  onSaved: () => void;
}

/** The member's own name and default boat (2026-11-03), saved with `PUT /api/me/profile`. */
export function ProfileForm(props: ProfileFormProps) {
  const t = authStrings();
  const id = useId();
  const [first, setFirst] = useState(props.firstName ?? '');
  const [last, setLast] = useState(props.lastName ?? '');
  const [boat, setBoat] = useState<BoatClass>(props.defaultBoatType ?? DEFAULT_BOAT);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState('busy');
    void api('/api/me/profile', {
      method: 'PUT',
      body: { firstName: first, lastName: last, defaultBoatType: boat },
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState('saved');
        props.onSaved();
      })
      .catch(() => {
        setState('failed');
      });
  };

  return (
    <form className="form profile-form" onSubmit={submit} data-testid="profile-form">
      <label htmlFor={`${id}-first`}>{t.firstName}</label>
      <input
        id={`${id}-first`}
        value={first}
        maxLength={60}
        autoComplete="given-name"
        required
        onChange={(e) => {
          setFirst(e.target.value);
          setState('idle');
        }}
      />
      <label htmlFor={`${id}-last`}>{t.lastName}</label>
      <input
        id={`${id}-last`}
        value={last}
        maxLength={60}
        autoComplete="family-name"
        required
        onChange={(e) => {
          setLast(e.target.value);
          setState('idle');
        }}
      />
      {props.withBoat && (
        <>
          <label htmlFor={`${id}-boat`}>{t.defaultBoat}</label>
          <select
            id={`${id}-boat`}
            value={boat}
            onChange={(e) => {
              setBoat(e.target.value as BoatClass);
              setState('idle');
            }}
          >
            {BOAT_CLASS_NAMES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </>
      )}
      <span className="form__actions">
        <button
          type="submit"
          disabled={state === 'busy' || first.trim() === '' || last.trim() === ''}
        >
          {t.saveProfile}
        </button>
        {state === 'saved' && <span role="status">{t.profileSaved}</span>}
      </span>
      {state === 'failed' && (
        <p role="alert" className="error">
          {t.profileFailed}
        </p>
      )}
    </form>
  );
}
