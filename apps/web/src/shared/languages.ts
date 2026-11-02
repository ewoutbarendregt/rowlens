/** Interface languages (client `i18n/language.ts`) and the languages of login mails. */
export const LANGUAGES = ['nl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'nl';
