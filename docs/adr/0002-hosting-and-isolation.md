# ADR-0002: Hosting on trustable-prod as an isolated Compose project

- **Status**: proposed
- **Date**: 2026-11-01
- **Related**: [server inspection](../phase-0/server-inspection.md), ADR-0003, ADR-0006

## Context

RowLens must run on the existing `trustable-prod` VPS next to trustable.nl and AudioScribe without
touching them, and must be able to move later (separate web/worker/storage hosts).

AudioScribe is deployed as a profile inside trustable's own Compose project. That works for one small
container, but it couples AudioScribe's definition to the trustable repo. RowLens has five services
(web, worker, db, object storage, migrations) and its own database; putting them in trustable's compose
file would mean every RowLens change needs a trustable.nl PR, and trustable's `--remove-orphans` deploy
would own our containers.

## Decision

1. RowLens is its **own Compose project** (`name: rowlens`) in **`/opt/rowlens/`**, with its own
   compose file, `.env` (mode 640), volumes (`rowlens_*`) and networks. Nothing in `/opt/trustable` changes
   except the Caddyfile route (ADR-0003).
2. Networks:
   - `rowlens_internal` (`internal: true`): web, worker, db (minio dropped: ADR-0006 amendment). Not reachable from other projects.
   - The **web container alone** also joins the existing **`trustable_proxy`** network as an
     `external: true` network, with alias `rowlens-web`, so Caddy can reach it. DB, worker and storage are
     never on `trustable_proxy`.
3. **No published ports.** Only Caddy faces the internet.
4. **Resource limits** on every service so RowLens can never starve trustable/AudioScribe
   (starting point on the 4 vCPU / 8 GB host: web 1 CPU/512 MB, db 1 CPU/1 GB, worker 2 CPU/2.5 GB at
   `nice`, minio 0.5 CPU/512 MB).
5. **Separate Docker credentials** (until 2026-11-24): deploy commands ran with
   `DOCKER_CONFIG=/opt/rowlens/.docker`, so RowLens never overwrote the `deploy` user's GHCR login.
   Since the local deploy (below) no registry login happens on the server at all.
6. Images: `ghcr.io/ewoutbarendregt/rowlens-web` and `rowlens-worker`, immutable tags
   (`<semver>` and `sha-<7>`), never deploy `latest`. Old RowLens images are pruned by our deploy only
   (`docker image prune` filtered by `label=org.opencontainers.image.source=…/rowlens`).
7. **Deploys run from Ewout's Mac** (since 2026-11-24, replacing the GitHub Actions `images` and
   `deploy` workflows): `scripts/deploy.sh prod [--ref <ref>] [--dry-run] [--yes]` checks the ref out
   into a temporary worktree, builds both images for `linux/amd64` with `docker buildx --load`, uploads
   them with `docker save | gzip | ssh trustable-contabo 'gunzip | docker load'` and runs
   `/opt/rowlens/bin/rowlens-deploy deploy sha-<7>` there: DB backup → migrate → `up --pull never` →
   readiness check → keep, or roll back to the previous tag. No registry and no CI secrets are involved.
   Remote commands run with `ssh -n` and docker commands get `< /dev/null`: a script piped into
   `ssh … bash -s` loses the rest of its stdin to `docker compose exec/run` and stops silently with
   exit 0. The deploy then checks an end marker, the running image tags and the public URL.
   **Environments: local development and production only** (decided 2026-11-01). There is no RowLens
   staging; pre-production testing happens locally (`pnpm dev:*`, the edge stack behind a Caddy mirror,
   and the deploy rehearsal).
   **Approval gate**: deploying is a command Ewout asks for explicitly, each time (AGENTS.md). Merging
   to `main` deploys nothing. Merging is by convention only: agents never push or merge to `main`.
   The compose file lives on the server and changes only through `infra/deploy/install.sh` (approval
   required), so a deploy decides *which* image runs, never *how*; `deploy.sh --dry-run` shows any
   difference between the server's copies and the ref. `rowlens-deploy` still validates
   `SSH_ORIGINAL_COMMAND` (`deploy <tag>`, `rollback`, `status`), so it can be bound to a forced-command
   key again if deploys ever run from somewhere other than Ewout's own key.
   *History*: 2026-11-01 → 2026-11-24 CD was GitHub Actions → GHCR → SSH with a RowLens-only CI key
   bound to `restrict,command="/opt/rowlens/bin/rowlens-deploy"` (#25), the run's `GITHUB_TOKEN` on
   stdin for the pull. Retired when production moved from Hetzner (46.225.212.217, now only a Caddy
   forwarder) to Contabo (144.91.87.103) and Ewout stopped using GitHub Actions for deployments.

## Consequences

- RowLens can be moved to another host by copying `/opt/rowlens` + volumes and changing one Caddy upstream.
- Joining `trustable_proxy` means RowLens's web container can reach trustable's `web`/`api` containers on
  that network (and vice versa). Acceptable for now; it can be replaced by a dedicated `edge` network once
  trustable's compose file is willing to declare it.
- Adding a deploy key to `deploy`'s `authorized_keys` and the Caddyfile route are shared-component
  changes → **each needs your explicit approval** with the exact diff (listed in the Phase 0 summary).
- Local deploys depend on the Mac that runs them (Docker with buildx, the `trustable-contabo` SSH
  alias). Building for `linux/amd64` on Apple silicon is emulated and slower than CI was.

## Alternatives considered

- **Profile inside trustable's compose (AudioScribe pattern)** — couples repos; rejected.
- **Bind a host port and use `host.docker.internal`** (Caddy already has the extra_host) — the app would
  have to listen on the docker bridge IP and UFW rules would need to allow it; more fragile, rejected.
- **Separate VPS now** — cleaner, but you asked to start on the existing server. Revisit at M3.
