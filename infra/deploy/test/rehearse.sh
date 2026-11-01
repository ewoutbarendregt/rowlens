#!/usr/bin/env bash
# Rehearses rowlens-deploy end to end against the local Docker engine: real compose file, real
# Postgres, real health checks, no registry and no server. Runs the script inside a Linux container
# (GNU tools, flock) that talks to the host's Docker socket.
#
#   infra/deploy/test/rehearse.sh
#
# Creates and afterwards removes: network trustable_proxy (local only), project rowlens-rehearsal,
# images ghcr.io/ewoutbarendregt/rowlens-web:sha-000000{1,2,b}.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
IMG=ghcr.io/ewoutbarendregt/rowlens-web
WORK="$(mktemp -d)"
created_network=0

cleanup() {
  # compose must run where /opt/rowlens/.env exists, i.e. inside the runner container.
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK/home:/opt/rowlens" \
    -e ROWLENS_TAG=cleanup rowlens-rehearsal-runner docker compose -p rowlens \
    -f /opt/rowlens/docker-compose.yml --env-file /opt/rowlens/.env down -v --remove-orphans \
    >/dev/null 2>&1 || true
  docker image rm "$IMG:sha-0000001" "$IMG:sha-0000002" "$IMG:sha-000000b" >/dev/null 2>&1 || true
  ((created_network)) && docker network rm trustable_proxy >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if docker network inspect trustable_proxy >/dev/null 2>&1; then
  echo "A local network 'trustable_proxy' already exists; refusing to reuse it." >&2
  exit 1
fi
docker network create trustable_proxy >/dev/null && created_network=1

# Images are built right before each deploy, like a pull would bring them in: a successful deploy
# prunes every RowLens image except the current and previous release.
build() {
  docker build -q -f "$REPO/apps/web/Dockerfile" --build-arg APP_VERSION="$1" -t "$IMG:$1" "$REPO" >/dev/null
}
build_broken() {
  # Starts, but never serves: readiness never passes.
  build sha-0000002
  printf 'FROM %s\nCMD ["node", "-e", "setInterval(() => {}, 1000)"]\n' "$IMG:sha-0000002" |
    docker build -q -t "$IMG:sha-000000b" - >/dev/null
}
docker pull -q postgres:16-alpine >/dev/null

# Same layout as /opt/rowlens; the prod compose file reads /opt/rowlens/.env, so the runner
# container mounts this directory at that path.
mkdir -p "$WORK/home"
cp "$REPO/infra/compose/docker-compose.prod.yml" "$WORK/home/docker-compose.yml"
printf 'NODE_ENV=production\nPUBLIC_ORIGIN=http://localhost\nBASE_PATH=/projects/rowlens\nPOSTGRES_PASSWORD=rehearsal\n' >"$WORK/home/.env"

run() {
  docker run --rm -i -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK/home:/opt/rowlens" \
    -v "$REPO/infra/deploy/rowlens-deploy:/usr/local/bin/rowlens-deploy:ro" \
    -e ROWLENS_HEALTH_TIMEOUT=45 rowlens-rehearsal-runner rowlens-deploy "$@" </dev/null
}

printf 'FROM docker:cli\nRUN apk add --no-cache bash util-linux findutils coreutils >/dev/null\n' |
  docker build -q -t rowlens-rehearsal-runner - >/dev/null

expect() {
  local want="$1"
  shift
  local got=0
  run "$@" || got=$?
  if [[ "$got" != "$want" ]]; then
    echo "FAIL: '$*' exited $got, expected $want" >&2
    exit 1
  fi
  echo "ok: '$*' exited $got"
}

echo "== first deploy"
build sha-0000001
expect 0 deploy sha-0000001
echo "== second deploy (database is running now, so it gets backed up)"
build sha-0000002
expect 0 deploy sha-0000002
assert() { if "${@:2}"; then echo "ok: $1"; else echo "FAIL: $1" >&2; exit 1; fi; }
assert "pre-deploy backup written" compgen -G "$WORK/home/backups/pre-deploy-*-sha-0000002.dump"
echo "== broken release rolls back"
build_broken
expect 3 deploy sha-000000b
assert "still on sha-0000002" grep -qx sha-0000002 "$WORK/home/state/current-tag"
echo "== rollback to the previous release"
expect 0 rollback
assert "now on sha-0000001" grep -qx sha-0000001 "$WORK/home/state/current-tag"
expect 0 status
echo "== rehearsal passed"
