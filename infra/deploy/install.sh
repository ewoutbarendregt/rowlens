#!/usr/bin/env bash
# Installs the deploy entry point and compose file on trustable-prod and binds the RowLens CI key to it.
#
# Touches a shared component (deploy's authorized_keys): run only with Ewout's explicit approval.
# Uses the management SSH alias (your own key), never the CI key. Idempotent; backs up authorized_keys.
#
#   infra/deploy/install.sh            # ROWLENS_SSH_HOST=trustable-prod by default
set -euo pipefail

HOST="${ROWLENS_SSH_HOST:-trustable-prod}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBKEY_FILE="${ROWLENS_CI_PUBKEY:-$HOME/.ssh/rowlens_deploy.pub}"
# The key's base64 body identifies its line in authorized_keys.
KEY_BODY="$(awk '{print $2}' "$PUBKEY_FILE")"
[[ "$KEY_BODY" =~ ^AAAA[0-9A-Za-z+/=]+$ ]] || { echo "unexpected public key in $PUBKEY_FILE" >&2; exit 1; }

ssh "$HOST" 'install -d -m 750 /opt/rowlens/bin'
scp -q "$HERE/rowlens-deploy" "$HOST:/opt/rowlens/bin/rowlens-deploy.new"
scp -q "$HERE/../compose/docker-compose.prod.yml" "$HOST:/opt/rowlens/docker-compose.yml.new"

ssh "$HOST" bash -s -- "$KEY_BODY" <<'REMOTE'
set -euo pipefail
key="$1"
cd /opt/rowlens
chmod 750 bin/rowlens-deploy.new && mv bin/rowlens-deploy.new bin/rowlens-deploy
chmod 640 docker-compose.yml.new && mv docker-compose.yml.new docker-compose.yml

f="$HOME/.ssh/authorized_keys"
want="restrict,command=\"/opt/rowlens/bin/rowlens-deploy\" ssh-ed25519 $key gh-actions-rowlens"
count="$(grep -cF "$key" "$f" || true)"
[[ "$count" == 1 ]] || { echo "expected exactly one authorized_keys line with the CI key, found $count" >&2; exit 1; }
if grep -qxF "$want" "$f"; then
  echo "authorized_keys: CI key already restricted"
else
  backup="$f.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$f" "$backup"
  awk -v key="$key" -v want="$want" 'index($0, key) { print want; next } { print }' "$f" >"$f.tmp"
  chmod 600 "$f.tmp" && mv "$f.tmp" "$f"
  echo "authorized_keys: CI key restricted (backup: $backup); change:"
  diff "$backup" "$f" | sed -E 's/(AAAA[0-9A-Za-z+/]{8})[0-9A-Za-z+/=]+/\1…/' || true
fi

ls -l /opt/rowlens/bin/rowlens-deploy /opt/rowlens/docker-compose.yml
/opt/rowlens/bin/rowlens-deploy status
REMOTE
