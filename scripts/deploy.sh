#!/usr/bin/env bash
# deploy.sh — build RowLens on this machine and deploy it to production (ADR-0002). Replaces the
# GitHub Actions `deploy` and `images` workflows (removed 2026-11-24).
#
#   scripts/deploy.sh prod                  # deploy origin/main
#   scripts/deploy.sh prod --ref <git-ref>  # deploy a specific commit/branch/tag
#   scripts/deploy.sh prod --dry-run        # build + preflight only; nothing changes on the server
#   scripts/deploy.sh prod --yes            # skip the confirmation prompt
#
# Steps:
#   1. git fetch; check out <ref> into a temporary worktree (uncommitted work is never deployed)
#   2. preflight (read-only): ssh, server tools, disk space, current release, and whether the
#      server's rowlens-deploy and compose file match this ref (else: infra/deploy/install.sh)
#   3. build rowlens-web and rowlens-worker for linux/amd64 (`docker buildx --load`), tag sha-<7>
#   4. upload them with `docker save | gzip | ssh … 'gunzip | docker load'` (no registry)
#   5. run /opt/rowlens/bin/rowlens-deploy deploy sha-<7> on the server: DB backup → migrate →
#      up --pull never → readiness check → keep, or roll back to the previous release
#   6. check that the containers and the public URL report sha-<7>
#
# Requirements: docker with buildx, git, and `ssh trustable-contabo` (user deploy, your own key).
# Only on Ewout's explicit request, each time (AGENTS.md). There is no staging.
#
# Rollback: ssh trustable-contabo /opt/rowlens/bin/rowlens-deploy rollback   (only with Ewout's yes)

set -euo pipefail

# The whole script is one { … } block: bash parses it completely before running anything, so
# editing or checking out another version of this file during a deploy cannot change the run.
{
usage() {
  sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

ENV_NAME="${1:-}"
[[ -n "$ENV_NAME" ]] || usage 1
shift
REF=""
DRY_RUN=0
YES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      REF="${2:?--ref needs a value}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --yes | -y)
      YES=1
      shift
      ;;
    -h | --help) usage 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
done

case "$ENV_NAME" in
  prod)
    SSH_HOST="${DEPLOY_SSH_HOST:-trustable-contabo}" # Contabo 144.91.87.103 since 2026-11-24
    DEFAULT_REF="origin/main"
    PUBLIC_URL="https://trustable.nl/projects/rowlens"
    ;;
  -h | --help) usage 0 ;;
  *)
    echo "First argument must be 'prod' (there is no staging)." >&2
    usage 1
    ;;
esac

REMOTE_DIR="/opt/rowlens"
WEB_IMAGE="ghcr.io/ewoutbarendregt/rowlens-web"
WORKER_IMAGE="ghcr.io/ewoutbarendregt/rowlens-worker"
MIN_FREE_GB=5
REPO_ROOT="$(git rev-parse --show-toplevel)"
REF="${REF:-$DEFAULT_REF}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mWARNING: %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[31mERROR: %s\033[0m\n' "$*" >&2
  exit 1
}
# All ssh calls share one multiplexed connection (fewer handshakes for sshd's rate limits). Short
# socket path: macOS limits it to ~104 characters, too few for $TMPDIR.
SSH_CTL="$(mktemp -d /tmp/rowlens-ssh.XXXXXX)"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15
  -o ControlMaster=auto -o "ControlPath=$SSH_CTL/%C" -o ControlPersist=120)
# Every remote command gets -n (stdin = /dev/null): nothing on the server can swallow our input.
rssh() { ssh -n "${SSH_OPTS[@]}" "$SSH_HOST" "$@"; }
WORK=""
# shellcheck disable=SC2329 # invoked by the EXIT trap
cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$SSH_HOST" >/dev/null 2>&1 || true
  if [[ -n "$WORK" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true
    rm -rf "$WORK"
  fi
  rm -rf "$SSH_CTL"
}
trap cleanup EXIT

# ── 1. Source ──────────────────────────────────────────────────────────────────────────────────
log "Fetching and resolving $REF"
git -C "$REPO_ROOT" fetch --quiet origin
SHA="$(git -C "$REPO_ROOT" rev-parse --verify --quiet "$REF^{commit}")" || die "Unknown ref: $REF"
TAG="sha-${SHA:0:7}"
echo "Deploying $ENV_NAME ← $REF ($TAG): $(git -C "$REPO_ROOT" log -1 --format=%s "$SHA")"
if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$SHA" origin/main; then
  warn "$TAG is not on origin/main (deploying an unmerged ref)"
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rowlens-deploy.XXXXXX")"
git -C "$REPO_ROOT" worktree add --quiet --detach "$WORK/src" "$SHA"
SRC="$WORK/src"

# ── 2. Preflight (read-only) ───────────────────────────────────────────────────────────────────
log "Preflight against $SSH_HOST"
command -v docker >/dev/null || die "docker not found"
docker buildx version >/dev/null 2>&1 || die "docker buildx not available"
for attempt in 1 2 3; do
  rssh true && break
  ((attempt < 3)) || die "Cannot ssh to $SSH_HOST"
  sleep 5
done
rssh "test -x $REMOTE_DIR/bin/rowlens-deploy && test -f $REMOTE_DIR/docker-compose.yml && test -f $REMOTE_DIR/.env" ||
  die "$SSH_HOST:$REMOTE_DIR is not set up (run infra/deploy/install.sh, with Ewout's approval)"
rssh 'docker version --format "docker {{.Server.Version}}" && docker compose version --short && command -v flock >/dev/null' ||
  die "docker, docker compose or flock missing on $SSH_HOST"

FREE_GB="$(rssh "df -P -BG /var/lib/docker 2>/dev/null || df -P -BG /" | awk 'NR==2 { sub("G", "", $4); print $4 }')"
echo "Free disk on $SSH_HOST: ${FREE_GB}G"
if [[ ! "$FREE_GB" =~ ^[0-9]+$ ]] || ((FREE_GB < MIN_FREE_GB)); then
  die "Less than ${MIN_FREE_GB}G free on $SSH_HOST"
fi

echo "Server status:"
rssh "$REMOTE_DIR/bin/rowlens-deploy status" 2>&1 | sed 's/^/    /'
CURRENT="$(rssh "cat $REMOTE_DIR/state/current-tag 2>/dev/null || true")"
PREVIOUS="$(rssh "cat $REMOTE_DIR/state/previous-tag 2>/dev/null || true")"
[[ "$CURRENT" == "$TAG" ]] && warn "$TAG is already the current release; this redeploys it"
# rowlens-deploy rolls back to the current release (or, when redeploying it, the previous one);
# that only works if its images are still on the server.
FALLBACK="$CURRENT"
[[ "$FALLBACK" == "$TAG" ]] && FALLBACK="$PREVIOUS"
if [[ -n "$FALLBACK" ]] &&
  ! rssh "docker image inspect $WEB_IMAGE:$FALLBACK $WORKER_IMAGE:$FALLBACK >/dev/null 2>&1"; then
  warn "rollback target $FALLBACK is not on $SSH_HOST: a failed deploy could not roll back"
fi

# The server copies are installed by infra/deploy/install.sh (approval needed); a deploy never
# changes them. Show where they differ from this ref so they are not silently out of date.
for pair in "bin/rowlens-deploy:infra/deploy/rowlens-deploy" \
  "docker-compose.yml:infra/compose/docker-compose.prod.yml"; do
  remote="${pair%%:*}" local_file="${pair#*:}"
  rssh "cat $REMOTE_DIR/$remote" >"$WORK/server.$(basename "$remote")"
  if cmp -s "$WORK/server.$(basename "$remote")" "$SRC/$local_file"; then
    echo "$REMOTE_DIR/$remote: matches $local_file"
  else
    warn "$REMOTE_DIR/$remote differs from $local_file at $TAG (update with infra/deploy/install.sh):"
    diff -u "$WORK/server.$(basename "$remote")" "$SRC/$local_file" | sed 's/^/    /' || true
  fi
done

# Displayed release (major.minor.<n>, ADR-0027): the GitHub run number used to provide <n>. Continue
# from the RowLens web images on the server (current + previous release): a commit that is already
# there keeps its number, a new one gets the highest + 1. ROWLENS_RELEASE_SEQ=<n> overrides.
# shellcheck disable=SC2016 # expanded on the server
SERVER_RELEASES="$(rssh 'docker image ls --format "{{.Repository}}:{{.Tag}}" '"$WEB_IMAGE"' |
  xargs -r docker image inspect --format "{{index .Config.Labels \"org.opencontainers.image.version\"}} {{index .Config.Labels \"org.opencontainers.image.revision\"}}"')"
SEQ="" MAX_SEQ=""
while read -r version revision; do
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.([0-9]+)$ ]] || continue
  n="${BASH_REMATCH[1]}"
  if [[ "$revision" == "$SHA" ]]; then SEQ="$n"; fi
  if [[ -z "$MAX_SEQ" ]] || ((n > MAX_SEQ)); then MAX_SEQ="$n"; fi
done <<<"$SERVER_RELEASES"
if [[ -n "${ROWLENS_RELEASE_SEQ:-}" ]]; then
  SEQ="$ROWLENS_RELEASE_SEQ"
elif [[ -z "$SEQ" ]]; then
  [[ -n "$MAX_SEQ" ]] || die "No release number on $SSH_HOST's images; set ROWLENS_RELEASE_SEQ=<n>"
  SEQ=$((MAX_SEQ + 1))
fi
RELEASE="$(cd "$SRC" && node --experimental-strip-types --no-warnings scripts/release-version.js "$SEQ")"
echo "Displayed release: $RELEASE (highest sequence on the server: ${MAX_SEQ:-none})"

# ── 3. Build ───────────────────────────────────────────────────────────────────────────────────
log "Building images (linux/amd64, tag $TAG)"
# Builds pull only public base images, anonymously, through a throwaway client config: on macOS the
# Docker CLI otherwise falls back to a ghcr.io token in the keychain, and a stale one makes every
# ghcr.io pull fail with "denied" (ghcr.io/astral-sh/uv in the worker image). Same daemon, same
# buildx plugin; nothing in ~/.docker or the keychain is read or changed.
BUILD_DOCKER="$WORK/docker"
mkdir -p "$BUILD_DOCKER/bin"
[[ -d "${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins" ]] &&
  ln -s "${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins" "$BUILD_DOCKER/cli-plugins"
cat >"$BUILD_DOCKER/bin/docker-credential-rowlens-anonymous" <<'HELPER'
#!/bin/sh
# Credential helper that never has credentials: every registry is pulled from anonymously.
case "$1" in
  get) cat >/dev/null; echo "credentials not found in native keychain"; exit 1 ;;
  list) echo "{}" ;;
  *) cat >/dev/null ;;
esac
HELPER
chmod +x "$BUILD_DOCKER/bin/docker-credential-rowlens-anonymous"
printf '{"credsStore":"rowlens-anonymous"}\n' >"$BUILD_DOCKER/config.json"
BUILD_DOCKER_HOST="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
build_docker() { PATH="$BUILD_DOCKER/bin:$PATH" DOCKER_CONFIG="$BUILD_DOCKER" DOCKER_HOST="$BUILD_DOCKER_HOST" docker "$@"; }
# The player demo, unified users and video reuse are on in production (Ewout, 2026-11-01 and later):
# the same build args the images workflow used.
build_docker buildx build --platform linux/amd64 --load \
  --build-arg "APP_VERSION=$TAG" \
  --build-arg "APP_RELEASE=$RELEASE" \
  --build-arg VITE_FEATURE_PLAYER_DEMO=true \
  --build-arg VITE_FEATURE_UNIFIED_USERS=true \
  --build-arg VITE_FEATURE_VIDEO_REUSE=true \
  --label "org.opencontainers.image.revision=$SHA" \
  --label "org.opencontainers.image.version=$RELEASE" \
  -t "$WEB_IMAGE:$TAG" -f "$SRC/apps/web/Dockerfile" "$SRC"
build_docker buildx build --platform linux/amd64 --load \
  --label "org.opencontainers.image.revision=$SHA" \
  --label "org.opencontainers.image.version=$RELEASE" \
  -t "$WORKER_IMAGE:$TAG" -f "$SRC/worker/Dockerfile" "$SRC/worker"
for image in "$WEB_IMAGE:$TAG" "$WORKER_IMAGE:$TAG"; do
  arch="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")"
  [[ "$arch" == linux/amd64 ]] || die "$image is $arch, not linux/amd64"
  echo "Built $image ($arch, $(docker image inspect --format '{{.Size}}' "$image" | awk '{ printf "%.0f MB", $1 / 1e6 }'))"
done

if ((DRY_RUN)); then
  log "Dry run: images built, preflight passed; nothing changed on $SSH_HOST"
  echo "Would upload $WEB_IMAGE:$TAG and $WORKER_IMAGE:$TAG and run: $REMOTE_DIR/bin/rowlens-deploy deploy $TAG"
  echo "DRY-RUN-OK $TAG"
  exit 0
fi

if ((!YES)); then
  printf '\nDeploy %s (%s) to %s, replacing %s? [y/N] ' "$TAG" "$REF" "$ENV_NAME" "${CURRENT:-nothing}"
  read -r answer
  [[ "$answer" == y || "$answer" == Y ]] || die "Aborted"
fi

# ── 4. Upload ──────────────────────────────────────────────────────────────────────────────────
log "Uploading images to $SSH_HOST"
docker save "$WEB_IMAGE:$TAG" "$WORKER_IMAGE:$TAG" | gzip -1 |
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" 'gunzip | docker load'
rssh "docker image inspect $WEB_IMAGE:$TAG $WORKER_IMAGE:$TAG >/dev/null" || die "Images did not arrive on $SSH_HOST"

# ── 5. Deploy on the server ────────────────────────────────────────────────────────────────────
log "Running rowlens-deploy deploy $TAG on $SSH_HOST"
# One command, stdin = /dev/null (ssh -n): never pipe a script into `ssh … bash -s`, because
# `docker compose exec/run` read stdin and would swallow the rest of it (trustable.nl BUG-012).
set +e
rssh "$REMOTE_DIR/bin/rowlens-deploy deploy $TAG < /dev/null; echo \"ROWLENS-DEPLOY-EXIT \$?\"" 2>&1 |
  tee "$WORK/remote.log"
set -e
CODE="$(sed -n 's/^ROWLENS-DEPLOY-EXIT \([0-9]*\)$/\1/p' "$WORK/remote.log" | tail -1)"
case "$CODE" in
  0) ;;
  3) die "$TAG did not become ready; rolled back to the previous release" ;;
  2) die "$TAG failed before or during start; nothing to roll back to, or nothing changed" ;;
  4) die "$TAG failed and the rollback failed too: ssh $SSH_HOST $REMOTE_DIR/bin/rowlens-deploy status" ;;
  75) die "Another deploy is running on $SSH_HOST" ;;
  "") die "rowlens-deploy did not finish (no end marker in its output)" ;;
  *) die "rowlens-deploy failed with exit code $CODE" ;;
esac

# ── 6. Verify ──────────────────────────────────────────────────────────────────────────────────
RUNNING="$(rssh "docker inspect --format '{{.Config.Image}}' rowlens-web-1 rowlens-worker-1" | tr '\n' ' ')"
echo "Running: $RUNNING"
case "$RUNNING" in
  *"$WEB_IMAGE:$TAG"*"$WORKER_IMAGE:$TAG"*) ;;
  *) die "Containers are not on $TAG" ;;
esac

log "Checking $PUBLIC_URL/health/ready"
for _ in $(seq 1 10); do
  if curl -fsS -m 10 "$PUBLIC_URL/health/live" | grep -q "\"version\":\"$TAG\""; then
    curl -fsS -m 10 "$PUBLIC_URL/health/ready"
    echo
    log "Deployed $TAG ($RELEASE) to $ENV_NAME"
    echo "Rollback: ssh $SSH_HOST $REMOTE_DIR/bin/rowlens-deploy rollback   (to ${CURRENT:-none})"
    exit 0
  fi
  sleep 3
done
die "$PUBLIC_URL/health/live does not report $TAG"
# shellcheck disable=SC2317 # stops bash from reading past the block
exit
}
