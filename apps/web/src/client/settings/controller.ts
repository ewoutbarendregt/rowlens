import { useSyncExternalStore } from 'react';
import { api } from '../api.ts';
import { lang, savedLanguage, setLanguage } from '../i18n/language.ts';
import { applyTheme, savedTheme } from '../ui/theme.ts';
import { storedNoteHoldSeconds, storedNotesVisible } from '../notes/overlay.ts';
import { storedDriveMiddle } from '../strokes/preferences.ts';
import {
  DEFAULT_PREFERENCES,
  effectivePreferences,
  userSettingsSchema,
  type Preferences,
} from '../../shared/user-settings.ts';
import { createSettingsStore } from './store.ts';
const transient = { setItem: () => undefined, removeItem: () => undefined };
const key = (id: string) => `rowlens.userSettings.${id}`;
export const devicePreferences = (): Preferences => {
  try {
    return {
      language: savedLanguage(),
      theme: savedTheme(),
      notesVisible: storedNotesVisible(),
      noteHoldSeconds: storedNoteHoldSeconds(),
      driveMiddle: storedDriveMiddle(),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};
export const ownSettings = createSettingsStore({
  load: async () => {
    const response = await api('/api/me/settings');
    if (!response.ok) throw new Error('settings_load');
    return userSettingsSchema.parse(await response.json());
  },
  save: async (_userId, revision, changes, importLegacy) => {
    const response = await api('/api/me/settings', {
      method: 'PATCH',
      body: { revision, changes, importLegacy },
    });
    if (!response.ok) throw new Error('settings_save');
    return userSettingsSchema.parse(await response.json());
  },
  apply: (settings) => {
    const p = effectivePreferences(settings, devicePreferences());
    applyTheme(p.theme);
    if (lang() !== p.language) setLanguage(p.language, transient);
  },
  cached: (id) => {
    try {
      return userSettingsSchema.parse(JSON.parse(localStorage.getItem(key(id)) ?? 'null'));
    } catch {
      return null;
    }
  },
  cache: (id, settings) => {
    try {
      localStorage.setItem(
        key(id),
        JSON.stringify({ ...settings, firstName: null, lastName: null, defaultBoatType: null }),
      );
    } catch {
      /* Device storage may be unavailable. */
    }
  },
});
export function useOwnSettings() {
  const state = useSyncExternalStore(ownSettings.subscribe, ownSettings.get, ownSettings.get);
  return { ...state, preferences: effectivePreferences(state.settings, devicePreferences()) };
}
export const saveOwnPreference = (changes: Partial<Preferences>) => ownSettings.save(changes);
