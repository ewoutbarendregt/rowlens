---
description: Merge a PR and deploy it to production — only when Ewout asked for it in this conversation
---

First check the conversation: **only continue if Ewout explicitly asked to merge and deploy, for
this change, in this conversation.** Otherwise stop and ask him. There is no staging.

PR or tag to deploy: $ARGUMENTS

Follow "Deploying" in AGENTS.md step by step:

1. `gh pr checks <N>` must be all green; then `gh pr merge <N> --squash --delete-branch`.
2. Wait for the `images` and `ci` runs of the merge commit on `main` (`gh run list --branch main`),
   check them with `gh run view`.
3. `gh workflow run deploy.yml -f tag=sha-<7> -f check_public_url=true` and wait for the run.
4. Verify read-only: `/health/ready` shows the new version with `db` ok; `ssh trustable-prod
   'docker ps'` shows rowlens-web and rowlens-worker on the new tag and the trustable and AudioScribe
   containers untouched; trustable.nl, api.trustable.nl/api/health and the AudioScribe page answer
   200. New migrations: count and backfill jobs (SQL on stdin, see AGENTS.md).
5. Report the tag, the deploy run id and what was verified; log it in the next PR's
   DOCUMENTATION.md entry and in docs/runbooks/server-setup.md.

Never change anything else on the server. Rolling back needs Ewout's yes.
