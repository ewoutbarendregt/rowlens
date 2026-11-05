# RowLens

Video review and traceable technique analysis for rowing clubs: upload session video from a phone,
step through the catch and the extraction frame by frame, discuss it with your crew and coach, and get
analysis you can check down to the frame.

Status: a pilot with one club, live at https://trustable.nl/projects/rowlens. Working name; may change.

- Product & plan: [PLAN.md](PLAN.md) · Features: [FEATURES.md](FEATURES.md)
- Architecture: [BUILD.md](BUILD.md) · [ADRs](docs/adr/README.md)
- Working agreement for humans and coding agents (opencode, Claude Code, Codex): [AGENTS.md](AGENTS.md);
  current state for whoever picks it up: [docs/HANDOFF.md](docs/HANDOFF.md)
- Phase 0: [server inspection](docs/phase-0/server-inspection.md) · [summary](docs/phase-0/summary.md)

## Quick start

```bash
corepack enable && pnpm install && pnpm test
cd worker && uv sync && uv run pytest
```
