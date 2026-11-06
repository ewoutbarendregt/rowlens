import { useEffect, useId, useState } from 'react';
import { BOAT_CLASS_NAMES } from '../../shared/boats.ts';
import {
  PREFERENCE_KEYS,
  settingsPatchSchema,
  userSettingsSchema,
  type SettingsPatch,
  type UserSettings,
} from '../../shared/user-settings.ts';
import { LANGUAGE_NAMES } from '../i18n/language.ts';
import { api } from '../api.ts';
import { settingsStrings } from '../settings/strings.ts';

type Draft = Record<keyof SettingsPatch, string | number | boolean | null>;
const flat = (s: UserSettings): Draft => ({
  ...s.preferences,
  firstName: s.firstName,
  lastName: s.lastName,
  defaultBoatType: s.defaultBoatType,
});
export function UserSettingsEditor({
  userId,
  name,
  onSaved,
}: {
  userId: string;
  name: string;
  onSaved: () => void;
}) {
  const t = settingsStrings();
  const id = useId();
  const [original, setOriginal] = useState<UserSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'failed' | 'conflict' | 'saved'>('idle');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let stale = false;
    setOriginal(null);
    setDraft(null);
    setStatus('idle');
    void api(`/api/admin/users/${userId}/settings`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = userSettingsSchema.parse(await response.json());
        if (!stale) {
          setOriginal(value);
          setDraft(flat(value));
        }
      })
      .catch(() => {
        if (!stale) setStatus('failed');
      });
    return () => {
      stale = true;
    };
  }, [userId, version]);
  const change = (key: keyof Draft, value: Draft[keyof Draft]) => {
    setDraft((d) => (d === null ? null : { ...d, [key]: value }));
    if (status !== 'conflict') setStatus('idle');
  };
  const patch =
    original === null || draft === null
      ? {}
      : Object.fromEntries(
          Object.entries(draft).filter(
            ([key, value]) => value !== flat(original)[key as keyof Draft],
          ),
        );
  const parsed = settingsPatchSchema.safeParse(patch);
  const save = async () => {
    if (original === null || !parsed.success) return;
    setBusy(true);
    setStatus('idle');
    try {
      const response = await api(`/api/admin/users/${userId}/settings`, {
        method: 'PATCH',
        body: { revision: original.revision, changes: parsed.data },
      });
      if (response.status === 409) {
        setStatus('conflict');
        return;
      }
      if (!response.ok) throw new Error();
      const value = userSettingsSchema.parse(await response.json());
      setOriginal(value);
      setDraft(flat(value));
      setStatus('saved');
      onSaved();
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };
  if (draft === null)
    return (
      <p role={status === 'failed' ? 'alert' : 'status'}>
        {status === 'failed' ? t.failed : t.loading}
        {status === 'failed' && (
          <button
            type="button"
            onClick={() => {
              setVersion((v) => v + 1);
            }}
          >
            {t.reload}
          </button>
        )}
      </p>
    );
  const select = (
    key: keyof Draft,
    label: string,
    options: { value: string | number | boolean; label: string }[],
    nullable = false,
  ) => (
    <div key={key} className="admin-settings__field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <select
        id={`${id}-${key}`}
        disabled={busy}
        value={draft[key] === null ? '' : String(draft[key])}
        onChange={(event) => {
          const option = options.find((o) => String(o.value) === event.target.value);
          change(key, option?.value ?? null);
        }}
      >
        <option value="" disabled={!nullable}>
          {nullable ? t.defaultBoat : t.unknown}
        </option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <form
      className="form admin-settings"
      data-testid="admin-user-settings"
      aria-label={t.settingsFor(name)}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3>{t.settingsFor(name)}</h3>
      {(['firstName', 'lastName'] as const).map((key) => (
        <label key={key} htmlFor={`${id}-${key}`}>
          {t[key]}
          <input
            id={`${id}-${key}`}
            maxLength={60}
            value={String(draft[key] ?? '')}
            disabled={busy}
            autoComplete="off"
            onChange={(e) => {
              change(key, e.target.value);
            }}
          />
        </label>
      ))}
      {select(
        'defaultBoatType',
        t.boat,
        BOAT_CLASS_NAMES.map((value) => ({ value, label: value })),
        true,
      )}
      {select('language', t.language, [
        { value: 'nl', label: LANGUAGE_NAMES.nl },
        { value: 'en', label: LANGUAGE_NAMES.en },
      ])}
      {select(
        'theme',
        t.theme,
        (['light', 'dark', 'hc'] as const).map((value) => ({ value, label: t.themes[value] })),
      )}
      {select('notesVisible', t.notesVisible, [
        { value: true, label: t.on },
        { value: false, label: t.off },
      ])}
      {select(
        'noteHoldSeconds',
        t.noteHoldSeconds,
        [0.5, 1, 2].map((value) => ({ value, label: t.seconds(value) })),
      )}
      {select('driveMiddle', t.driveMiddle, [
        { value: true, label: t.on },
        { value: false, label: t.off },
      ])}
      {PREFERENCE_KEYS.some((key) => original?.preferences[key] === null) && (
        <p className="muted">{t.unknown}</p>
      )}
      <div className="form__actions">
        <button type="submit" disabled={busy || !parsed.success || status === 'conflict'}>
          {t.save}
        </button>
        <button
          type="button"
          className="button--quiet"
          disabled={busy}
          onClick={() => {
            if (original !== null) setDraft(flat(original));
            setStatus('idle');
          }}
        >
          {t.cancel}
        </button>
      </div>
      {status === 'saved' && <p role="status">{t.saved}</p>}
      {(status === 'failed' || status === 'conflict') && (
        <p role="alert">
          {status === 'conflict' ? t.conflict : t.failed}
          <button
            type="button"
            className="button--quiet"
            disabled={busy}
            onClick={() => {
              setVersion((v) => v + 1);
            }}
          >
            {t.reload}
          </button>
        </p>
      )}
    </form>
  );
}
