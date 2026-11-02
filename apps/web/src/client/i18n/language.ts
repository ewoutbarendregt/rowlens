import { useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE, type Language, LANGUAGES } from '../../shared/languages.ts';

export { DEFAULT_LANGUAGE, type Language, LANGUAGES };

/**
 * The interface language: Dutch unless English was chosen on this device. The browser's language
 * is not used, on purpose: RowLens is for Dutch clubs first. Adding a language means a catalog per
 * strings module (and the login mail), an entry in `shared/languages.ts`, a name in LANGUAGE_NAMES
 * and a locale in LOCALES.
 */

/** Each language in its own words, as language switches show them. */
export const LANGUAGE_NAMES: Record<Language, string> = { nl: 'Nederlands', en: 'English' };

/** For Intl date and number formats. */
export const LOCALES: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB' };

const KEY = 'rowlens.lang';

export const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.includes(value as Language);

/** The saved choice; Dutch when nothing is saved or storage is unavailable (private mode). */
export function savedLanguage(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): Language {
  try {
    const value = storage?.getItem(KEY);
    return isLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

let current: Language = savedLanguage();
const listeners = new Set<() => void>();

/** The language strings and formats use right now. */
export const lang = (): Language => current;

export const locale = (language: Language = current): string => LOCALES[language];

/** Switches the whole interface; components that call `useLanguage()` re-render. */
export function setLanguage(
  language: Language,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
): void {
  current = language;
  try {
    if (language === DEFAULT_LANGUAGE) storage?.removeItem(KEY);
    else storage?.setItem(KEY, language);
  } catch {
    // Storage refused (private mode, full): the choice lasts for this page only.
  }
  applyLanguage(language);
  for (const listener of listeners) listener();
}

/** `<html lang>`, for screen readers, hyphenation and the browser's own controls. */
export function applyLanguage(
  language: Language = current,
  root: HTMLElement = document.documentElement,
): void {
  root.lang = language;
}

export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    lang,
    lang,
  );
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
