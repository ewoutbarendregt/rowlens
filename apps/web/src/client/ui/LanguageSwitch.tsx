import { LANGUAGE_NAMES, LANGUAGES, setLanguage, useLanguage } from '../i18n/language.ts';

const legend = { nl: 'Taal', en: 'Language' };

/** Nederlands / English for this device; each language named in its own words. */
export function LanguageSwitch() {
  const language = useLanguage();

  return (
    <fieldset className="theme-switch" data-testid="language-switch">
      <legend>{legend[language]}</legend>
      <div className="theme-switch__options">
        {LANGUAGES.map((option) => (
          <button
            key={option}
            type="button"
            className="button--quiet"
            lang={option}
            aria-pressed={language === option}
            onClick={() => {
              setLanguage(option);
            }}
          >
            {LANGUAGE_NAMES[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
