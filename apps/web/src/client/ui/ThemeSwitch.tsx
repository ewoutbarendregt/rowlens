import { useState } from 'react';
import { lang } from '../sessions/strings.ts';
import { applyTheme, savedTheme, saveTheme, THEMES, type Theme } from './theme.ts';

const labels = {
  en: { legend: 'Display', light: 'Light', dark: 'Dark', hc: 'High contrast' },
  nl: { legend: 'Weergave', light: 'Licht', dark: 'Donker', hc: 'Hoog contrast' },
};

/** Light / dark / high contrast for this device (ADR-0012). */
export function ThemeSwitch() {
  const l = labels[lang()];
  const [theme, setTheme] = useState<Theme>(savedTheme);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  };

  return (
    <fieldset className="theme-switch" data-testid="theme-switch">
      <legend>{l.legend}</legend>
      <div className="theme-switch__options">
        {THEMES.map((option) => (
          <button
            key={option}
            type="button"
            className="button--quiet"
            aria-pressed={theme === option}
            onClick={() => {
              choose(option);
            }}
          >
            {l[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
