#!/usr/bin/env bash
# Single quotes in `bash -c '...' _ "$x"` checks are deliberate: $1 expands in the inner shell.
# shellcheck disable=SC2016
# Tests for infra/deploy/rowlens-deploy against a stubbed docker. Run on Linux (as on the server):
#   docker run --rm -v "$PWD:/repo:ro" -w /repo ubuntu:24.04 bash infra/deploy/test/run.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${ROWLENS_DEPLOY_SCRIPT:-$HERE/../rowlens-deploy}"
failures=0
passes=0

setup() {
  T="$(mktemp -d)"
  export ROWLENS_HOME="$T/home" STUB_DIR="$T/stub" ROWLENS_HEALTH_TIMEOUT=3
  mkdir -p "$ROWLENS_HOME" "$STUB_DIR"
  echo "services: {}" >"$ROWLENS_HOME/docker-compose.yml"
  echo "POSTGRES_PASSWORD=x" >"$ROWLENS_HOME/.env"
  unset STUB_PULL_EXIT STUB_UP_FAIL_TAGS STUB_HEALTHY_TAGS STUB_DB_RUNNING STUB_HAS_MIGRATE \
    STUB_MIGRATE_EXIT STUB_IMAGE_TAGS SSH_ORIGINAL_COMMAND
}

# run <stdin> <args...>: runs the script, sets $code and $out (stdout+stderr).
run() {
  local input="$1"
  shift
  out="$(printf '%s' "$input" | PATH="$HERE/stub:$PATH" bash "$SCRIPT" "$@" 2>&1)"
  code=$?
}

state() { cat "$ROWLENS_HOME/state/$1" 2>/dev/null || true; }
calls() { cat "$STUB_DIR/calls" 2>/dev/null || true; }

check() {
  local name="$1"
  shift
  if "$@"; then
    passes=$((passes + 1))
  else
    failures=$((failures + 1))
    printf 'FAIL: %s\n  code=%s\n  output:\n%s\n  calls:\n%s\n' "$name" "${code:-}" "${out:-}" "$(calls)"
  fi
}

t() { printf '· %s\n' "$1"; }

# ---------------------------------------------------------------- input validation
t "usage errors exit 64 and touch nothing"
for args in "" "deploy" "deploy sha-abc1234 extra" "status now" "rm -rf /"; do
  setup
  # shellcheck disable=SC2086
  run "" $args
  check "usage: '$args'" test "$code" -eq 64
  check "no docker calls for '$args'" test -z "$(calls)"
done

t "invalid tags are rejected"
for tag in "latest" "sha-XYZ1234" "v1.2" "sha-abc1234;id" "../../etc"; do
  setup
  run "" deploy "$tag"
  check "tag '$tag' rejected" test "$code" -eq 64
  check "no docker calls for tag '$tag'" test -z "$(calls)"
done

t "forced-command input is split, never evaluated"
setup
export SSH_ORIGINAL_COMMAND='deploy $(touch '"$T"'/pwned)'
run ""
check "injection rejected" test "$code" -eq 64
check "injection not executed" test ! -e "$T/pwned"
setup
export SSH_ORIGINAL_COMMAND='status; touch '"$T"'/pwned'
run ""
check "chained command rejected" test "$code" -eq 64
check "chained command not executed" test ! -e "$T/pwned"

t "SSH_ORIGINAL_COMMAND drives the command when forced"
setup
export SSH_ORIGINAL_COMMAND="deploy sha-aaaaaaa" STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "token-123" ignored-args
check "forced deploy succeeds" test "$code" -eq 0
check "forced deploy recorded" test "$(state current-tag)" = sha-aaaaaaa

# ---------------------------------------------------------------- deploys
t "first deploy: login, pull, up, ready, logout; token never printed"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "secret-token-123" deploy sha-aaaaaaa
check "exit 0" test "$code" -eq 0
check "current tag" test "$(state current-tag)" = sha-aaaaaaa
check "no previous tag" test -z "$(state previous-tag)"
check "release.env" grep -qx "ROWLENS_TAG=sha-aaaaaaa" "$ROWLENS_HOME/state/release.env"
check "token passed to docker login" grep -qx "secret-token-123" "$STUB_DIR/token-received"
check "token not in output" bash -c '! grep -q secret-token-123 <<<"$1"' _ "$out"
check "token not in docker args" bash -c '! grep -q secret-token-123 "$1"' _ "$STUB_DIR/calls"
check "pulled with the new tag" grep -q "ROWLENS_TAG=sha-aaaaaaa docker compose .* pull" "$STUB_DIR/calls"
check "logged out" grep -q "docker logout ghcr.io" "$STUB_DIR/calls"

t "deploy without a token uses local images"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
check "exit 0" test "$code" -eq 0
check "no login" bash -c '! grep -q "docker login" "$1"' _ "$STUB_DIR/calls"
check "no pull" bash -c '! grep -q " pull" "$1"' _ "$STUB_DIR/calls"

t "second deploy keeps the first as previous and prunes older images"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa sha-bbbbbbb" STUB_IMAGE_TAGS="sha-aaaaaaa sha-bbbbbbb sha-0000000"
run "" deploy sha-aaaaaaa
run "" deploy sha-bbbbbbb
check "exit 0" test "$code" -eq 0
check "current" test "$(state current-tag)" = sha-bbbbbbb
check "previous" test "$(state previous-tag)" = sha-aaaaaaa
check "old image removed" grep -q "docker image rm ghcr.io/ewoutbarendregt/rowlens-web:sha-0000000" "$STUB_DIR/calls"
check "previous image kept" bash -c '! grep -q "image rm .*:sha-aaaaaaa" "$1"' _ "$STUB_DIR/calls"

t "unhealthy new tag rolls back to the current one"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
run "" deploy sha-bbbbbbb
check "exit 3" test "$code" -eq 3
check "current unchanged" test "$(state current-tag)" = sha-aaaaaaa
check "running the old tag again" test "$(cat "$STUB_DIR/running")" = sha-aaaaaaa

t "failed 'up' is not mistaken for success while the old container is still healthy"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa sha-bbbbbbb" STUB_UP_FAIL_TAGS="sha-bbbbbbb"
run "" deploy sha-aaaaaaa
run "" deploy sha-bbbbbbb
check "exit 3" test "$code" -eq 3
check "current unchanged" test "$(state current-tag)" = sha-aaaaaaa

t "unhealthy first deploy stops web and exits 2"
setup
export STUB_HEALTHY_TAGS=""
run "" deploy sha-aaaaaaa
check "exit 2" test "$code" -eq 2
check "no current tag" test -z "$(state current-tag)"
check "web stopped" grep -q "compose .* stop web" "$STUB_DIR/calls"

t "pull failure changes nothing"
setup
export STUB_PULL_EXIT=1
run "token" deploy sha-aaaaaaa
check "exit 2" test "$code" -eq 2
check "no up" bash -c '! grep -q " up " "$1"' _ "$STUB_DIR/calls"
check "logged out anyway" grep -q "docker logout ghcr.io" "$STUB_DIR/calls"

t "running database is backed up before deploying"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa" STUB_DB_RUNNING=1
run "" deploy sha-aaaaaaa
check "exit 0" test "$code" -eq 0
check "dump written" bash -c 'grep -q PGDMP-fake "$1"/backups/pre-deploy-*-sha-aaaaaaa.dump' _ "$ROWLENS_HOME"

t "only the newest 10 pre-deploy backups are kept"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa" STUB_DB_RUNNING=1
mkdir -p "$ROWLENS_HOME/backups"
for i in $(seq -w 1 12); do
  touch -d "2026-01-$i" "$ROWLENS_HOME/backups/pre-deploy-202601${i}T000000Z-sha-1111111.dump"
done
run "" deploy sha-aaaaaaa
check "10 kept" test "$(find "$ROWLENS_HOME/backups" -name 'pre-deploy-*.dump' | wc -l)" -eq 10
check "newest kept" compgen -G "$ROWLENS_HOME/backups/pre-deploy-*-sha-aaaaaaa.dump"
check "oldest removed" test ! -e "$ROWLENS_HOME/backups/pre-deploy-20260101T000000Z-sha-1111111.dump"

t "failing migrations stop the deploy before containers restart"
setup
export STUB_HAS_MIGRATE=1 STUB_MIGRATE_EXIT=1 STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
check "exit 2" test "$code" -eq 2
check "no up" bash -c '! grep -q " up " "$1"' _ "$STUB_DIR/calls"

t "migrations run when defined"
setup
export STUB_HAS_MIGRATE=1 STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
check "exit 0" test "$code" -eq 0
check "migrate ran with new tag" grep -q "ROWLENS_TAG=sha-aaaaaaa docker compose .* run --rm migrate" "$STUB_DIR/calls"

t "first deploy: the migrate check sees the new tag (no release.env yet)"
setup
export STUB_HAS_MIGRATE=1 STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
check "exit 0" test "$code" -eq 0
check "config with the tag" grep -q "ROWLENS_TAG=sha-aaaaaaa docker compose .* config --services" "$STUB_DIR/calls"
check "migrate ran" grep -q "run --rm migrate" "$STUB_DIR/calls"

t "a failing compose config stops the deploy instead of skipping migrations"
setup
export STUB_HAS_MIGRATE=1 STUB_CONFIG_FAIL=1 STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
check "exit 2" test "$code" -eq 2
check "no up" bash -c '! grep -q " up " "$1"' _ "$STUB_DIR/calls"
check "no migrate run" bash -c '! grep -q "run --rm migrate" "$1"' _ "$STUB_DIR/calls"
unset STUB_CONFIG_FAIL

# ---------------------------------------------------------------- rollback, status, locking
t "rollback swaps current and previous"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa sha-bbbbbbb"
run "" deploy sha-aaaaaaa
run "" deploy sha-bbbbbbb
run "" rollback
check "exit 0" test "$code" -eq 0
check "current" test "$(state current-tag)" = sha-aaaaaaa
check "previous" test "$(state previous-tag)" = sha-bbbbbbb

t "rollback without history exits 2"
setup
run "" rollback
check "exit 2" test "$code" -eq 2

t "status prints the tags"
setup
export STUB_HEALTHY_TAGS="sha-aaaaaaa"
run "" deploy sha-aaaaaaa
run "" status
check "exit 0" test "$code" -eq 0
check "shows current" grep -q "current: sha-aaaaaaa" <<<"$out"

t "a second concurrent run is refused"
setup
mkdir -p "$ROWLENS_HOME/state"
exec 8>"$ROWLENS_HOME/state/.lock"
flock 8
run "" status
check "exit 75" test "$code" -eq 75
exec 8>&-

t "missing compose file is a usage error"
setup
rm "$ROWLENS_HOME/docker-compose.yml"
run "" status
check "exit 64" test "$code" -eq 64

printf '\n%d passed, %d failed\n' "$passes" "$failures"
((failures == 0))
