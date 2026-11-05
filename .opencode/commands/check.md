---
description: Run every check a PR needs (web, worker) and report the numbers
---

Run the checks from the "Commands" section of AGENTS.md, in this order, and stop at the first
failure to fix it:

1. `pnpm format:check && pnpm lint && pnpm typecheck`
2. `pnpm test` (unit + database tests; needs Docker)
3. `cd worker && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest`

Then report per step: passed or failed, and the test counts. If the change touches the player,
uploads, drawing, angles or the worker, also offer the end-to-end runs (`/e2e`).

$ARGUMENTS
