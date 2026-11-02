# ADR-0014: Classical design system, self-hosted, with derived dark and high-contrast modes

- **Status**: accepted
- **Date**: 2026-11-02
- **Supersedes**: ADR-0012

## Context

Ewout made mockups of the main screens in Claude Design ("RowLens Mockups.dc.html": login, code,
wrong code, sessions list, video page). They use the **Classical** design system: Cormorant Garamond
headings, Lora body text, one gold accent (#b68235), hairline rules, outlined buttons, unfilled
bordered cards and Lucide icons. He chose to take this style over the Nouryon-based style of ADR-0012
(#118), which was not deployed yet.

Classical has only a light mode. It loads its fonts from Google Fonts, which our CSP
(`font-src 'self'`) and privacy stance (no third-party requests from the app) don't allow.

## Decision

- **Copy, don't fork.** `apps/web/src/client/design/classical.css` is the system's `styles.css` minus
  its first line (the Google Fonts `@import`); the source hash is in `design/README.md`. It is not
  edited by hand and is excluded from Prettier.
- **Self-hosted fonts** from `@fontsource/cormorant-garamond` and `@fontsource/lora` (400, 400 italic,
  600; SIL OFL 1.1), imported in `main.tsx` and bundled by Vite. **Icons**: only the Lucide paths we
  use, in `client/ui/icons.tsx` (ISC). Licences in `design/LICENSES.md`.
- **One semantic layer.** `design/theme.css` maps the names `styles.css` binds to (`--color-surface-*`,
  `--color-text-*`, `--color-fill-*`, `--color-border-*`, `--color-status-*`, spacing, type) onto
  Classical's tokens. RowLens's own colours stay: the drawing colours `--rl-draw*` (the mockups' gold)
  and `--rl-here*` (the frame on screen).
- **Dark and high contrast are ours**, derived from Classical's ramps: dark is a warm near-black with
  paper-coloured text and the accent lifted to its 400 step; high contrast is black on white with the
  accent at 800. Light stays the default; the choice is per device as before.
  `src/server/ui-theme-contrast.test.ts` checks every text pair in all three modes against WCAG 2.1 AA
  (4.5:1 for text, 3:1 for the accent as stroke).
- **RowLens keeps its touch rules**: 44 px targets where Classical draws 36 px controls, and 16 px text
  in inputs so iOS doesn't zoom. Status colours (green, red) are added in muted tones; Classical is
  monochrome plus gold.
- **Layouts from the mockups** where they exist (login, header, sessions table per month, video page);
  other pages take the style through the shared classes without a new layout.

## Consequences

- The five font files (Latin subsets, woff2) add about 120 kB to the first load; they are cached after.
- Updating the style means copying the system's `styles.css` again without the `@import`, recording
  the hash, running the contrast test and looking at the pages in all three modes.
- ADR-0012's tokens, fonts (Arimo, IBM Plex Mono) and its brand-scrubbing step are gone.
