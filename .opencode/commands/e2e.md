---
description: Run the local and the edge end-to-end suites (Playwright)
---

Run the end-to-end suites from AGENTS.md and report the counts:

1. `pnpm demo:media --e2e` if `apps/web/public/demo-media/e2e-boat.webm` is missing.
2. Local: `VITE_FEATURE_PLAYER_DEMO=true pnpm build && pnpm --filter @rowlens/web e2e`.
3. Edge (behind Caddy, with the real worker): `pnpm edge:up && pnpm e2e:edge`, then
   `pnpm edge:down`.

For a failure, read the test's `error-context.md` under `apps/web/test-results/` before changing
anything. Known flakes are in BUGS.md (BUG-012, BUG-016, BUG-017); say so when one of those is the
cause, and rerun that spec alone. Remember the local edge database is kept between runs.

$ARGUMENTS
