# Design tokens and fonts

RowLens takes its visual style (colours, type, spacing, radii, motion, focus ring and the three
colour modes) from an external design system, **without its brand**: no name, logo or brand mark
appears in the app. See ADR-0012.

| File                         | What                                                                            | Source                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tokens.css`                 | All design tokens: light on `:root`, `[data-theme="dark"]`, `[data-theme="hc"]` | Byte-for-byte copy of `tokens/nouryon-tokens-1.0.css`, design system v1.0, commit `93a86eb` (2026-09-01), sha256 `2c5a8fae7481f960…` |
| `fonts.css`, `fonts/*.woff2` | Arimo and IBM Plex Mono, self-hosted                                            | `.design-sync/fonts/` of the same commit; only the `url()` paths changed (`./fonts/`)                                                |
| `LICENSES.md`                | Font licences (SIL OFL 1.1)                                                     |                                                                                                                                      |

Don't edit `tokens.css` by hand: to update, copy the file again, record the new commit and
hash here, and check the pages in all three modes. RowLens binds to the **semantic** tokens only
(`--color-surface-*`, `--color-text-*`, `--color-fill-*`, `--color-border-*`, `--color-status-*`,
`--space-*`, `--radius-*`, `--text-*`, `--font-*`), never to primitives or `--slide-*`.

The build (Vite/Lightning CSS) drops comments, so the source's name in the comments of
`tokens.css` does not reach the published CSS.
