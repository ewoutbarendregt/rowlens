# ADR-0012: UI style from the Nouryon Design System, without its brand

- **Status**: accepted
- **Date**: 2026-11-02

## Context

RowLens had its own small stylesheet: four colour variables, the system font, a few fixed colours and
a dark mode that followed the operating system. Ewout asked for the look of the Nouryon Design System
v1.0, an internal design system he has locally. RowLens is not a Nouryon product, so it may borrow the
style but not the brand. Ewout confirmed he may use the system this way.

## Decision

- **Take the tokens, not the brand.** `apps/web/src/client/design/tokens.css` is a byte-for-byte copy
  of the system's token file: colours, type scale, spacing, radii, elevation, motion, focus ring and
  three colour modes. No name, logo, brand mark or icons appear in the app. The React package is not
  used: it is private and built for React 18, and RowLens keeps its own markup.
- **Semantic tokens only.** `styles.css` uses `--color-surface-*`, `--color-text-*`,
  `--color-fill-*`, `--color-border-*`, `--color-status-*`, `--space-*`, `--radius-*`, `--text-*`
  and `--font-*`. Buttons, inputs, cards, status badges and confirmations take the look of the
  system's button, input, panel, status and callout components on RowLens's existing selectors, so
  the measured video layouts (BUG-005, BUG-008) don't change.
- **RowLens's own colours, on purpose**: the drawing colour (yellow, `--rl-draw`) must stand out on any
  video in every mode, and "the frame on screen" keeps its orange (`--rl-here`, the system's chart
  orange).
- **Colour mode**: light for everyone by default, as in the system. Dark and high contrast are a
  choice on the home page, stored per device (`localStorage`, falling back to light), applied as
  `data-theme` on `<html>` before the first render. The OS setting no longer switches RowLens to dark.
- **Touch targets stay 44 px.** The system's controls are 32–40 px for desktop tools; RowLens is
  phone-first and the player needs 44 px targets (#53). Inputs keep a 16 px font so iOS doesn't zoom.
- **Fonts**: the system's stack (Arial, with Arimo as fallback; IBM Plex Mono for figures), self-hosted
  under the SIL Open Font License 1.1 (`design/LICENSES.md`).
- **No brand in the published files**: the build drops CSS comments, which are the only place the
  source's name appears; checked in `dist/`.

## Consequences

- Updating the style means copying the token file again and recording the commit in
  `design/README.md`; the system's contrast checks (WCAG 2.1 AA) cover the token pairs RowLens uses.
- Users who had dark mode from their OS see light until they choose dark once.
- New UI binds to the semantic tokens; hard-coded colours need a reason, written next to them.
