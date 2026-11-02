import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The dark and high-contrast modes in client/design/theme.css are ours (ADR-0014): check every text
// pair against WCAG 2.1 AA. Lives with the Node-side tests because it reads the stylesheets from disk.
const read = (name: string) =>
  readFileSync(new URL(`../client/design/${name}`, import.meta.url), 'utf8');
const classicalCss = read('classical.css');
const themeCss = read('theme.css');
/** `--name: #hex;` declarations inside the first block that starts with `selector`. */
function hexVars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no block ${selector}`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (m[1] !== undefined && m[2] !== undefined) vars[m[1]] = m[2];
  }
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const classical = hexVars(classicalCss, ':root');
const theme = themeCss;
const modes = {
  light: { ...classical, ...hexVars(theme, ':root') },
  dark: { ...classical, ...hexVars(theme, ':root'), ...hexVars(theme, "[data-theme='dark']") },
  hc: { ...classical, ...hexVars(theme, ':root'), ...hexVars(theme, "[data-theme='hc']") },
};

// [foreground, background, minimum ratio]
const pairs: [string, string, number][] = [
  ['--color-text', '--color-bg', 4.5],
  ['--color-text-secondary', '--color-bg', 4.5],
  ['--color-text-muted', '--color-bg', 4.5],
  ['--color-text-brand', '--color-bg', 4.5],
  ['--color-fill-danger', '--color-bg', 4.5],
  ['--color-status-success-text', '--color-status-success-fill', 4.5],
  ['--color-status-warning-text', '--color-status-warning-fill', 4.5],
  ['--color-status-danger-text', '--color-status-danger-fill', 4.5],
  ['--color-status-neutral-text', '--color-status-neutral-fill', 4.5],
  // Strokes, focus rings and large text in the accent: 3:1 (WCAG 1.4.11).
  ['--color-accent', '--color-bg', 3],
];

describe('colour modes meet WCAG AA', () => {
  for (const [mode, vars] of Object.entries(modes)) {
    for (const [fg, bg, min] of pairs) {
      it(`${mode}: ${fg} on ${bg} ≥ ${String(min)}:1`, () => {
        const a = vars[fg];
        const b = vars[bg];
        expect([a, b].every((v) => v !== undefined)).toBe(true);
        expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
