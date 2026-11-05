---
description: Bring docs/HANDOFF.md and the project logs up to date at the end of a session
---

Bring the hand-off up to date so the next agent (any tool) can pick up without this conversation:

1. `docs/HANDOFF.md`: date, `main` commit, what production runs (check
   `https://trustable.nl/projects/rowlens/health/ready`), open PRs (`gh pr list`), work in progress
   (branch, what's done, what's left), decisions waiting for Ewout, suggested next steps.
2. `DOCUMENTATION.md`: an entry for this session's work if there isn't one (format in AGENTS.md),
   including deployments not logged yet.
3. `BUGS.md`, `TEST.md`, `FEATURES.md`, `BUILD.md`: whatever this session changed.

Keep HANDOFF.md short (about one screen); details belong in DOCUMENTATION.md. Commit on the
session's branch, not on `main`.

$ARGUMENTS
