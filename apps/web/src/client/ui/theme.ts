/**
 * Colour mode (ADR-0012): light by default for everyone, dark or high contrast only when chosen on
 * this device. The design tokens switch on `data-theme` on <html>; the OS setting is ignored on
 * purpose, like the design system does.
 */
export const THEMES = ['light', 'dark', 'hc'] as const;
export type Theme = (typeof THEMES)[number];

const KEY = 'rowlens.theme';

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** The saved choice; light when nothing is saved or storage is unavailable (private mode). */
export function savedTheme(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Theme {
  try {
    const value = storage?.getItem(KEY);
    return isTheme(value) ? value : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'light') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function saveTheme(
  theme: Theme,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
): void {
  try {
    if (theme === 'light') storage?.removeItem(KEY);
    else storage?.setItem(KEY, theme);
  } catch {
    // Storage refused (private mode, full): the choice lasts for this page only.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
