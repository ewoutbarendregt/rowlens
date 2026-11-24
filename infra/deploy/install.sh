#!/usr/bin/env bash
# Installs the deploy entry point and the compose file in /opt/rowlens on the production server.
#
# Changes the server's RowLens setup: run only with Ewout's explicit approval, after showing the diff
# (scripts/deploy.sh prod --dry-run prints it). Uses your own SSH alias (user deploy). Idempotent;
# keeps the replaced files as *.bak-<timestamp>. Touches nothing outside /opt/rowlens.
#
#   infra/deploy/install.sh            # ROWLENS_SSH_HOST=trustable-contabo by default
set -euo pipefail

HOST="${ROWLENS_SSH_HOST:-trustable-contabo}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Every remote command gets -n: stdin never feeds a remote shell (see scripts/deploy.sh).
ssh -n "$HOST" 'install -d -m 750 /opt/rowlens/bin'
scp -q "$HERE/rowlens-deploy" "$HOST:/opt/rowlens/bin/rowlens-deploy.new"
scp -q "$HERE/../compose/docker-compose.prod.yml" "$HOST:/opt/rowlens/docker-compose.yml.new"

# shellcheck disable=SC2016 # expanded on the server
ssh -n "$HOST" 'set -euo pipefail
cd /opt/rowlens
ts="$(date -u +%Y%m%dT%H%M%SZ)"
for pair in bin/rowlens-deploy:750 docker-compose.yml:640; do
  f="${pair%%:*}" mode="${pair#*:}"
  if [[ -f "$f" ]] && cmp -s "$f" "$f.new"; then
    rm "$f.new"
    echo "$f: unchanged"
    continue
  fi
  [[ -f "$f" ]] && cp -p "$f" "$f.bak-$ts" && echo "$f: replaced (old copy: $f.bak-$ts)"
  chmod "$mode" "$f.new" && mv "$f.new" "$f"
done
ls -l /opt/rowlens/bin/rowlens-deploy /opt/rowlens/docker-compose.yml
/opt/rowlens/bin/rowlens-deploy status
echo INSTALL-OK' | tee /dev/stderr | grep -qx INSTALL-OK || { echo "install did not finish" >&2; exit 1; }
