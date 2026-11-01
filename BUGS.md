# BUGS

Known issues and fix status. Format: see `~/.claude/CLAUDE.md`.

### [BUG-001] E2E server fails to start once DATABASE_URL is required in production — medium
**Location**: apps/web/playwright.config.ts:30
**Status**: fixed
**Found**: 2026-11-01
**Description**: #86 made `DATABASE_URL` required with `NODE_ENV=production`; Playwright's web server ran `dist/server/main.js` in production mode without a database, so CI's E2E step couldn't start (local checks had covered the edge stack, not this suite).
**Fix**: `e2e/server.ts` starts a throwaway Postgres via Testcontainers, migrates it, then runs the server (PR #86).
