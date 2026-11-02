# ADR-0015: Dutch by default, with a language switch

- **Status**: accepted
- **Date**: 2026-11-02

## Context

Each strings module picked Dutch or English from the browser's language (`navigator.language`), and
the login-code mail followed the language stored on the account when it was first created. Most
browsers, including Dutch rowers' laptops, are set to English, so the pilot clubs saw RowLens in
English. Ewout decided (2026-11-02): **Dutch is the default, with a switch to English; more languages
may follow.** Issue #34 had planned "browser language, else Dutch"; this replaces that part.

## Decision

- **One place decides**: `client/i18n/language.ts`. The language is the choice saved on this device
  (`localStorage` `rowlens.lang`), else Dutch. The browser's language is not used.
- **A switch** ("Nederlands" / "English", each in its own words) on the login page and in the account
  menu, next to the display mode. Switching re-renders the app from the root without remounting, so
  a playing video, a drawing in progress and running uploads carry on. `<html lang>` follows.
- **Mails follow the screen**: the login page sends the chosen language with the code request; the
  server sends the code mail in it (unknown or missing: Dutch). Invitations stay bilingual.
- **Adding a language**: a catalog in every strings module and the login mail, an entry in
  `shared/languages.ts`, a name in `LANGUAGE_NAMES` and a locale in `LOCALES`. The switch is a row of
  buttons; past three or four languages it becomes a select.

## Consequences

- People who had RowLens in English through their browser see Dutch until they switch once per
  device.
- The choice is per device, not per account (no extra column, works before login). If people ask to
  carry it across devices, it can move to the account later.
- Still open in #34: one catalog format (i18next) and a lint rule against hard-coded strings.
