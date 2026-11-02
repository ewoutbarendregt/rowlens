# Design system: Classical

RowLens takes its look from the **Classical** design system that Ewout's mockups ("RowLens
Mockups.dc.html", Claude Design, 2026-11-02) were made with: Cormorant Garamond headings over Lora
body text, a single gold accent, hairline rules, outlined buttons and unfilled bordered cards.
See ADR-0014 (it replaces ADR-0012).

| File            | What                                                                                                                                                                               | Source                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classical.css` | The system's tokens (`:root`), base type and component classes (`.btn`, `.input`, `.card`, `.tag`, `.seg`, `.nav`, `.table`, `.dialog`, `.hr`)                                     | Copy of the system's `styles.css` (sha256 `a5fcb177fc30afc9…`) **minus its first line**, the `@import` of Google Fonts: the fonts are self-hosted instead |
| `theme.css`     | RowLens's semantic tokens on top of Classical, and the **dark** and **high-contrast** modes Classical doesn't have, derived from its ramps (`src/server/ui-theme-contrast.test.ts` checks their contrast) | Ours                                                                                                                                                      |
| `LICENSES.md`   | Fonts (SIL OFL 1.1) and Lucide icons (ISC)                                                                                                                                         |                                                                                                                                                           |

Fonts come from `@fontsource/cormorant-garamond` and `@fontsource/lora` (imported in `main.tsx`), so
the browser loads them from our own origin (CSP `font-src 'self'`).

Don't edit `classical.css` by hand: to update, copy the system's `styles.css` again without the
`@import` line, record the new hash here, and look at the pages in all three modes.
