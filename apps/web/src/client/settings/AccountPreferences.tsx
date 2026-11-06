import { useId } from 'react';
import { PREFERENCE_KEYS } from '../../shared/user-settings.ts';
import { devicePreferences, ownSettings, saveOwnPreference, useOwnSettings } from './controller.ts';
import { settingsStrings } from './strings.ts';
export function AccountPreferences() {
  const t = settingsStrings();
  const id = useId();
  const state = useOwnSettings();
  const p = state.preferences;
  const unknown =
    state.settings !== null && PREFERENCE_KEYS.some((k) => state.settings?.preferences[k] === null);
  return (
    <fieldset className="account-preferences" data-testid="account-preferences">
      <legend>{t.personal}</legend>
      <label>
        <input
          type="checkbox"
          checked={p.notesVisible}
          disabled={state.loading || state.saving}
          onChange={(e) => {
            void saveOwnPreference({ notesVisible: e.target.checked });
          }}
        />
        {t.notesVisible}
      </label>
      <div>
        <label htmlFor={id}>{t.noteHoldSeconds}</label>
        <select
          id={id}
          value={p.noteHoldSeconds}
          disabled={state.loading || state.saving}
          onChange={(e) => {
            void saveOwnPreference({ noteHoldSeconds: Number(e.target.value) as 0.5 | 1 | 2 });
          }}
        >
          {[0.5, 1, 2].map((n) => (
            <option key={n} value={n}>
              {t.seconds(n)}
            </option>
          ))}
        </select>
      </div>
      <label>
        <input
          type="checkbox"
          checked={p.driveMiddle}
          disabled={state.loading || state.saving}
          onChange={(e) => {
            void saveOwnPreference({ driveMiddle: e.target.checked });
          }}
        />
        {t.driveMiddle}
      </label>
      {unknown && (
        <div>
          <p className="muted">{t.legacy}</p>
          <button
            type="button"
            className="button--quiet"
            disabled={state.loading || state.saving}
            onClick={() => {
              void ownSettings.save(devicePreferences(), true);
            }}
          >
            {t.importLegacy}
          </button>
        </div>
      )}
      {state.failed && (
        <p role="alert">
          {t.failed}{' '}
          <button
            type="button"
            className="button--quiet"
            onClick={() => {
              void ownSettings.refresh();
            }}
          >
            {t.reload}
          </button>
        </p>
      )}
    </fieldset>
  );
}
