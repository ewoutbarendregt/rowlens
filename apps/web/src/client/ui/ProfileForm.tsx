import { type SubmitEvent, useId, useState } from 'react';
import { BOAT_CLASS_NAMES, type BoatClass } from '../../shared/boats.ts';
import { api } from '../api.ts';
import { authStrings } from '../auth/strings.ts';
import { ownSettings, useOwnSettings } from '../settings/controller.ts';
import { settingsStrings } from '../settings/strings.ts';

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
  const settings = useOwnSettings();
  const [draft, setDraft] = useState<{
    firstName: string;
    lastName: string;
    defaultBoatType: BoatClass;
    revision: number;
  } | null>(null);
  const value = draft ?? {
    firstName: settings.settings?.firstName ?? props.firstName ?? '',
    lastName: settings.settings?.lastName ?? props.lastName ?? '',
    defaultBoatType: settings.settings?.defaultBoatType ?? props.defaultBoatType ?? DEFAULT_BOAT,
    revision: settings.settings?.revision ?? 0,
  };
  const { firstName: first, lastName: last, defaultBoatType: boat } = value;
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed' | 'conflict'>('idle');
  const change = (patch: Partial<typeof value>) => {
    setDraft({ ...value, ...patch });
    if (state !== 'conflict') setState('idle');
  };
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState('busy');
    void api('/api/me/profile', {
      method: 'PUT',
      body: value,
    })
      .then((res) => {
        if (res.status === 409) {
          setState('conflict');
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState('saved');
        setDraft(null);
        void ownSettings.refresh();
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
          change({ firstName: e.target.value });
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
          change({ lastName: e.target.value });
        }}
      />
      {props.withBoat && (
        <>
          <label htmlFor={`${id}-boat`}>{t.defaultBoat}</label>
          <select
            id={`${id}-boat`}
            value={boat}
            onChange={(e) => {
              change({ defaultBoatType: e.target.value as BoatClass });
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
          disabled={
            state === 'busy' ||
            state === 'conflict' ||
            settings.loading ||
            first.trim() === '' ||
            last.trim() === ''
          }
        >
          {t.saveProfile}
        </button>
        {state === 'saved' && <span role="status">{t.profileSaved}</span>}
      </span>
      {state === 'conflict' && (
        <p role="alert">
          {settingsStrings().conflict}
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setState('idle');
              void ownSettings.refresh();
              props.onSaved();
            }}
          >
            {settingsStrings().reload}
          </button>
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="error">
          {t.profileFailed}
        </p>
      )}
    </form>
  );
}
