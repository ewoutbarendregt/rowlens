# CLAUDE.md — RowLens

All project instructions live in `AGENTS.md`, shared with opencode, Codex and other agents, so that
the project can move between tools without losing rules. Claude Code imports it here:

@AGENTS.md

## Claude Code only

- Branches start with `claude/` (`claude/<type>/<issue>-<slug>`), per Ewout's global rule.
- The desktop app's preview starts the local stack from `.claude/launch.json` (`pnpm dev`, port 5174).
- Facts learned in Claude's own memory that matter to every agent belong in `AGENTS.md`, not only in
  the memory, so other tools have them too.
