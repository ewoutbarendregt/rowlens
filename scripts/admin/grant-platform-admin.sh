#!/usr/bin/env bash
# Operator-only bootstrap. The email stays off the command line and out of logs.
set -euo pipefail
cd "$(dirname "$0")/../../apps/web"
printf 'Verified account email (hidden): ' >&2
IFS= read -rs rowlens_bootstrap_email
printf '\n' >&2
printf '%s' "$rowlens_bootstrap_email" | node --env-file-if-exists=.env --experimental-strip-types src/server/db/grant-platform-admin-cli.ts
unset rowlens_bootstrap_email
