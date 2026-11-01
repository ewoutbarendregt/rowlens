## What & why

Closes #

## How it was tested

- [ ] `pnpm lint && pnpm typecheck && pnpm test` (web)
- [ ] `uv run ruff check && uv run mypy && uv run pytest` (worker)
- [ ] E2E / manual check (describe device + browser):

## Checklist

- [ ] Small, single-purpose PR; Conventional Commit title
- [ ] Tests added or updated (they are the definition of done)
- [ ] All user-facing strings in NL + EN catalogs
- [ ] Unfinished functionality is behind a feature flag
- [ ] `DOCUMENTATION.md` entry added; `BUGS.md` / `FEATURES.md` / ADRs updated if relevant
- [ ] No secrets, personal data or media committed

## Security review note

<!-- Required if this touches auth, sessions, permissions, tenancy, uploads, personal data or
external providers. Describe the threat and how the change handles it; otherwise write "n/a". -->
