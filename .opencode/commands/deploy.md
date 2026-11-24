---
description: Merge a PR and deploy it to production — only when Ewout asked for it in this conversation
---

First check the conversation: **only continue if Ewout explicitly asked to merge and deploy, for
this change, in this conversation.** Otherwise stop and ask him. There is no staging.

PR or ref to deploy: $ARGUMENTS

Follow "Deploying" in AGENTS.md step by step. Deploys run from this Mac; GitHub Actions never
deploys.

1. `gh pr checks <N>` must be all green (or Actions is blocked by billing and the local checks
   passed); then `gh pr merge <N> --squash --delete-branch`.
2. `scripts/deploy.sh prod --dry-run`, then `scripts/deploy.sh prod --yes` (deploys `origin/main`;
   `--ref <ref>` for another commit). Run it in the background; it prints `Deployed sha-<7>` at the
   end, or an error with the server's exit code.
3. Verify read-only: `/health/ready` shows the new version with `db` ok; `ssh trustable-contabo
   'docker ps'` shows rowlens-web and rowlens-worker on the new tag and the trustable and AudioScribe
   containers untouched; trustable.nl, api.trustable.nl/api/health and the AudioScribe page answer
   200. New migrations: count and backfill jobs (SQL on stdin, see AGENTS.md).
4. Report the tag, the pre-deploy dump and what was verified; log it in the next PR's
   DOCUMENTATION.md entry and in docs/runbooks/server-setup.md.

Never change anything else on the server. Rolling back needs Ewout's yes.
