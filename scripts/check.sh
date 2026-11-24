#!/usr/bin/env bash
# check.sh — RowLens' checks, run locally. RowLens uses no GitHub Actions (2026-11-24): run this
# before a PR is merged and paste its summary into the PR.
#
#   scripts/check.sh                   # everything: policy, secrets, web, worker, deploy, edge, images
#   scripts/check.sh --quick           # fast: branch name, format, lint, typecheck, unit tests
#   scripts/check.sh --only web        # one section (repeat or comma-separate: --only web,worker)
#   scripts/check.sh --quick --only worker
#   scripts/check.sh --keep-going      # run every step and report all failures at the end
#
# Sections: policy, secrets, web, worker, deploy, edge, images. Stops at the first failing step
# unless --keep-going. Needs, depending on the sections:
#   node 22 + pnpm (pnpm install done)   web, edge
#   Docker (running)                     web (db tests, ffmpeg for test clips), edge, images, deploy
#                                        (rehearsal; unit tests without flock, as on macOS), and
#                                        for the shellcheck/gitleaks steps when those are missing
#   uv                                   worker
#   Playwright browsers                  web, edge (installed on demand with `playwright install`)
#   (optional) shellcheck, gitleaks      their Docker images are used when missing
# Ports used: 4173 (E2E web server), 8080 (edge, EDGE_PORT), 3999 (image smoke test, SMOKE_PORT).
set -euo pipefail
# shellcheck disable=SC2329 # check functions are called through step()

# One { … } block: bash parses it fully before running (editing this file mid-run is safe).
{
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ALL_SECTIONS=(policy secrets web worker deploy edge images)
QUICK=0 KEEP_GOING=0 SECTIONS=()
usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick) QUICK=1 ;;
    --keep-going) KEEP_GOING=1 ;;
    --only)
      IFS=, read -r -a parts <<<"${2:?--only needs a section}"
      SECTIONS+=("${parts[@]}")
      shift
      ;;
    -h | --help) usage 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
  shift
done
if [[ ${#SECTIONS[@]} -eq 0 ]]; then
  if ((QUICK)); then SECTIONS=(policy web worker deploy); else SECTIONS=("${ALL_SECTIONS[@]}"); fi
fi
for s in "${SECTIONS[@]}"; do
  [[ " ${ALL_SECTIONS[*]} " == *" $s "* ]] || {
    echo "Unknown section: $s (one of: ${ALL_SECTIONS[*]})" >&2
    exit 1
  }
done
want() { [[ " ${SECTIONS[*]} " == *" $1 "* ]]; }

bold() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
RESULTS=() FAILED=0 START=$SECONDS
# step <name> <command…>: runs one check, records its result and time.
step() {
  local name="$1" t=$SECONDS
  shift
  bold "$name"
  if "$@"; then
    RESULTS+=("ok    $(printf '%4ss' $((SECONDS - t)))  $name")
  else
    RESULTS+=("FAIL  $(printf '%4ss' $((SECONDS - t)))  $name")
    FAILED=$((FAILED + 1))
    ((KEEP_GOING)) || summary
  fi
}
summary() {
  printf '\n\033[1mSummary (%s, %ss)\033[0m\n' "$( ((QUICK)) && echo quick || echo full)" $((SECONDS - START))
  printf '  %s\n' "${RESULTS[@]}"
  if ((FAILED)); then
    printf '\033[31m%d step(s) failed\033[0m\n' "$FAILED"
    exit 1
  fi
  echo "CHECKS-OK $(git rev-parse --short HEAD) ($(IFS=,; echo "${SECTIONS[*]}"))"
  exit 0
}

# ── Tools, checked up front ───────────────────────────────────────────────────────────────────
missing=()
need() { command -v "$1" >/dev/null 2>&1 || missing+=("$1: $2"); }
need_docker() {
  docker info >/dev/null 2>&1 || missing+=("docker (running): $1")
}
if want web || want edge; then
  need node "install Node 22 (corepack enable)"
  need pnpm "corepack enable"
  [[ -d node_modules ]] || missing+=("node_modules: run pnpm install")
fi
want worker && need uv "brew install uv"
if ((!QUICK)); then
  (want web || want edge || want images) && need_docker "db tests, test clips, edge stack, image builds"
  want deploy && need_docker "deploy rehearsal"
  want images && { docker buildx version >/dev/null 2>&1 || missing+=("docker buildx: image builds"); }
  want images && need curl "image smoke test" && need jq "image smoke test (brew install jq)"
fi
if want deploy && ! command -v flock >/dev/null 2>&1; then
  need_docker "rowlens-deploy unit tests run in ubuntu:24.04 (no flock on this host)"
fi
if want deploy && ! command -v shellcheck >/dev/null 2>&1; then
  need_docker "shellcheck runs in koalaman/shellcheck (or: brew install shellcheck)"
fi
if want secrets && ! command -v gitleaks >/dev/null 2>&1; then
  need_docker "gitleaks runs in zricethezav/gitleaks (or: brew install gitleaks)"
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing tools for: ${SECTIONS[*]}" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 2
fi

# ── Checks ─────────────────────────────────────────────────────────────────────────────────────
branch_name() {
  local b
  b="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$b" == HEAD || "$b" == main ]]; then
    echo "skipped: on $b (the policy applies to PR branches)"
    return 0
  fi
  if [[ "$b" =~ ^((claude|codex|opencode)/)?(feat|fix|chore|docs|refactor|test|ci|perf)/[a-z0-9][a-z0-9._-]*$ ]] ||
    [[ "$b" =~ ^dependabot[/-] ]]; then
    echo "ok: $b"
  else
    echo "Branch '$b' must match [(claude|codex|opencode)/](feat|fix|chore|docs|refactor|test|ci|perf)/<issue>-<slug>" >&2
    return 1
  fi
}

gitleaks_scan() {
  # Full history of this checkout (it is small), with the repo's .gitleaks.toml.
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks git --no-banner --redact -c .gitleaks.toml .
  else
    # A worktree's .git is a file pointing elsewhere: mount the common git dir as well.
    local common
    common="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
    docker run --rm -v "$ROOT:$ROOT:ro" -v "$common:$common:ro" -w "$ROOT" \
      zricethezav/gitleaks:latest git --no-banner --redact -c .gitleaks.toml .
  fi
}

release_version() {
  node --experimental-strip-types --no-warnings scripts/release-version.js 59 | grep -Ex '[0-9]+\.[0-9]+\.59'
}
demo_media() { bash scripts/demo-media/generate.sh --e2e; }
no_demo_in_prod_bundle() {
  rm -rf apps/web/dist && pnpm build
  # Demo-only markers: the player itself (requestVideoFrameCallback) ships on purpose since #49.
  if grep -rl "PlayerDemo\|demo-media\|measure-start" apps/web/dist/client --include=*.js; then
    echo "Feature-flagged demo code leaked into the production bundle" >&2
    return 1
  fi
}
build_with() { env "$@" pnpm build; }
web_e2e_reuse() {
  VITE_FEATURE_PLAYER_DEMO=true VITE_FEATURE_VIDEO_REUSE=true pnpm build &&
    pnpm --filter @rowlens/web e2e:reuse
}
web_e2e_unified() {
  VITE_FEATURE_PLAYER_DEMO=true VITE_FEATURE_UNIFIED_USERS=true pnpm build &&
    pnpm --filter @rowlens/web e2e:unified &&
    pnpm --filter @rowlens/web e2e:visibility &&
    pnpm --filter @rowlens/web e2e:sharing
}
playwright_install() {
  local b browsers=()
  for b in "$@"; do
    # Branded Chrome: Playwright's installer needs admin rights on macOS; use the installed app.
    if [[ "$b" == chrome && -d "/Applications/Google Chrome.app" ]]; then
      echo "chrome: using /Applications/Google Chrome.app"
      continue
    fi
    browsers+=("$b")
  done
  [[ ${#browsers[@]} -eq 0 ]] || pnpm --filter @rowlens/web exec playwright install "${browsers[@]}"
}

SHELL_FILES=(scripts/check.sh scripts/deploy.sh infra/deploy/rowlens-deploy infra/deploy/install.sh
  infra/deploy/test/*.sh infra/deploy/test/stub/docker scripts/admin/fix-production-kernel-054.sh
  scripts/admin/test/fix-production-kernel-054.test.sh)
run_shellcheck() {
  if command -v shellcheck >/dev/null 2>&1; then
    shellcheck -x "${SHELL_FILES[@]}"
  else
    docker run --rm -v "$ROOT:/repo:ro" -w /repo koalaman/shellcheck:stable -x "${SHELL_FILES[@]}"
  fi
}

deploy_unit_tests() {
  # rowlens-deploy needs flock (util-linux), which macOS lacks: run the stub tests in Ubuntu then.
  if command -v flock >/dev/null 2>&1; then
    bash infra/deploy/test/run.sh
  else
    docker run --rm -v "$ROOT:/repo:ro" -w /repo ubuntu:24.04 bash infra/deploy/test/run.sh
  fi
}

edge_e2e() {
  local rc=0
  pnpm edge:up || rc=$?
  ((rc)) || pnpm e2e:edge || rc=$?
  ((rc)) && docker compose -f infra/compose/docker-compose.edge.yml logs --no-color --tail 200 || true
  pnpm edge:down || true
  return "$rc"
}

pip_audit() {
  local req
  req="$(mktemp)"
  (cd worker && uv export --frozen --no-hashes --no-emit-project --format requirements-txt >"$req" &&
    uvx pip-audit -r "$req" --strict)
  local rc=$?
  rm -f "$req"
  return "$rc"
}

build_image() { # <name> <dockerfile> <context>
  docker buildx build --platform linux/amd64 --load -t "rowlens-$1:check" -f "$2" \
    --build-arg APP_RELEASE=0.0.999 --build-arg VITE_FEATURE_PLAYER_DEMO=true \
    --build-arg VITE_FEATURE_UNIFIED_USERS=true "$3"
}
smoke_web() {
  # Like production: Postgres, the image's migrate command as the owner, web as rowlens_app.
  local net="rowlens-check-$$" port="${SMOKE_PORT:-3999}" rc=1
  local db="$net-db" web="$net-web" url="http://127.0.0.1:${SMOKE_PORT:-3999}/projects/rowlens"
  docker network create "$net" >/dev/null
  docker run -d --name "$db" --network "$net" --network-alias db -e POSTGRES_DB=rowlens \
    -e POSTGRES_USER=rowlens_owner -e POSTGRES_PASSWORD=smoke_owner_only postgres:16-alpine >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$db" pg_isready -q -U rowlens_owner -d rowlens -h 127.0.0.1 && break
    sleep 1
  done
  if docker run --rm --platform linux/amd64 --network "$net" rowlens-web:check \
    sh -c 'test -f dist/server/db/migrations/0000_init.sql' &&
    docker run --rm --platform linux/amd64 --network "$net" -e ROWLENS_APP_DB_PASSWORD=smoke_app_password_only \
      -e DATABASE_OWNER_URL=postgres://rowlens_owner:smoke_owner_only@db:5432/rowlens \
      rowlens-web:check node dist/server/db/migrate-cli.js &&
    docker run -d --platform linux/amd64 --name "$web" --network "$net" -p "127.0.0.1:$port:3000" \
      -e PUBLIC_ORIGIN="http://127.0.0.1:$port" \
      -e OTP_PEPPER=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee \
      -e SMTP_HOST=smtp.invalid -e SMTP_USER=smoke -e SMTP_PASSWORD=smoke_only \
      -e MAIL_FROM=smoke@example.test \
      -e DATABASE_URL=postgres://rowlens_app:smoke_app_password_only@db:5432/rowlens \
      rowlens-web:check >/dev/null; then
    for _ in $(seq 1 60); do
      if curl -fsS "$url/health/ready"; then
        echo
        curl -fsS "$url/api/auth/status" | jq -e '.unified == true and .enabled == true and .access == false' &&
          curl -fsS -H 'accept: text/html' "$url/" | grep -q '<div id="root">' &&
          curl -fsS "$url/demo-media/manifest.json" | jq -e 'length > 0' >/dev/null &&
          curl -fsS "$url/build-info.json" | jq -e '.release == "0.0.999"' && rc=0
        break
      fi
      sleep 1
    done
    ((rc)) && docker logs "$web" 2>&1 | tail -50
  fi
  docker rm -f "$web" "$db" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  return "$rc"
}
smoke_worker() {
  docker run --rm --platform linux/amd64 rowlens-worker:check \
    sh -c "python -c 'import rowlens_worker.__main__' && ffmpeg -hide_banner -version | head -1"
}

# ── Sections ───────────────────────────────────────────────────────────────────────────────────
if want policy; then
  step "policy: branch name" branch_name
fi
if want secrets; then
  step "secrets: gitleaks (full history)" gitleaks_scan
fi
if want web; then
  step "web: format" pnpm format:check
  step "web: lint" pnpm lint
  step "web: typecheck" pnpm typecheck
  if ((QUICK)); then
    step "web: unit tests" pnpm --filter @rowlens/web exec vitest run --project unit
  else
    step "web: unit + db tests (Docker)" pnpm test
    step "web: release-version generator" release_version
    step "web: E2E test clips (ffmpeg in Docker)" demo_media
    step "web: production bundle has no demo code" no_demo_in_prod_bundle
    step "web: playwright browsers" playwright_install chromium webkit
    step "web: build with player demo" build_with VITE_FEATURE_PLAYER_DEMO=true
    step "web: E2E smoke + player" pnpm --filter @rowlens/web e2e
    step "web: E2E video reuse" web_e2e_reuse
    step "web: E2E unified accounts, visibility, sharing" web_e2e_unified
    step "web: pnpm audit (high)" pnpm audit --audit-level high
  fi
fi
if want worker; then
  step "worker: uv sync" bash -c 'cd worker && uv sync --frozen'
  step "worker: ruff check" bash -c 'cd worker && uv run ruff check'
  step "worker: ruff format" bash -c 'cd worker && uv run ruff format --check'
  step "worker: mypy" bash -c 'cd worker && uv run mypy'
  step "worker: pytest" bash -c 'cd worker && uv run pytest -q'
  ((QUICK)) || step "worker: pip-audit" pip_audit
fi
if want deploy; then
  step "deploy: shellcheck" run_shellcheck
  step "deploy: kernel maintenance parser" bash scripts/admin/test/fix-production-kernel-054.test.sh
  step "deploy: rowlens-deploy unit tests (stub docker)" deploy_unit_tests
  ((QUICK)) || step "deploy: rehearsal against real Docker" bash infra/deploy/test/rehearse.sh
fi
if want edge && ((!QUICK)); then
  step "edge: playwright browsers" playwright_install chromium chrome
  step "edge: E2E test clips" demo_media
  step "edge: E2E through Caddy" edge_e2e
fi
if want images && ((!QUICK)); then
  step "images: build web (linux/amd64)" build_image web apps/web/Dockerfile .
  step "images: smoke test web" smoke_web
  step "images: build worker (linux/amd64)" build_image worker worker/Dockerfile worker
  step "images: smoke test worker" smoke_worker
fi
summary
}
