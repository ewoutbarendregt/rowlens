import { describe, expect, it } from 'vitest';
import { LANGUAGE_NAMES, LANGUAGES, LOCALES, savedLanguage } from './language.ts';

const storage = (value: string | null) => ({ getItem: () => value });

describe('interface language', () => {
  it('is Dutch unless English was chosen on this device', () => {
    expect(savedLanguage(storage(null))).toBe('nl');
    expect(savedLanguage(storage('en'))).toBe('en');
    expect(savedLanguage(storage('de'))).toBe('nl');
    expect(
      savedLanguage({
        getItem: () => {
          throw new Error('private mode');
        },
      }),
    ).toBe('nl');
    expect(savedLanguage(undefined)).toBe('nl');
  });

  it('has a name and a locale for every language', () => {
    for (const language of LANGUAGES) {
      expect(LANGUAGE_NAMES[language]).not.toBe('');
      expect(LOCALES[language]).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });
});
