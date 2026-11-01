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
   - `rowlens_internal` (`internal: true`): web, worker, db, minio. Not reachable from other projects.
   - The **web container alone** also joins the existing **`trustable_proxy`** network as an
     `external: true` network, with alias `rowlens-web`, so Caddy can reach it. DB, worker and storage are
     never on `trustable_proxy`.
3. **No published ports.** Only Caddy faces the internet.
4. **Resource limits** on every service so RowLens can never starve trustable/AudioScribe
   (starting point on the 4 vCPU / 8 GB host: web 1 CPU/512 MB, db 1 CPU/1 GB, worker 2 CPU/2.5 GB at
   `nice`, minio 0.5 CPU/512 MB).
5. **Separate Docker credentials**: deploy commands run with `DOCKER_CONFIG=/opt/rowlens/.docker`, so
   RowLens never overwrites the `deploy` user's GHCR login that trustable's CD and AudioScribe rely on.
6. Images: `ghcr.io/ewoutbarendregt/rowlens-web` and `rowlens-worker`, immutable tags
   (`<semver>` and `sha-<7>`), never deploy `latest`. Old RowLens images are pruned by our deploy only
   (`docker image prune` filtered by `label=org.opencontainers.image.source=…/rowlens`).
7. CD (prepared in M0, enabled after your approval): GitHub Actions → GHCR → SSH as `deploy` with a
   **new, RowLens-only deploy key** → `docker compose -p rowlens pull && run migrate && up -d` → health
   check → roll back to the previous tag on failure.
   **Environments: local development and production only** (decided 2026-11-01). There is no RowLens
   staging; pre-production testing happens locally (`pnpm dev:*`, the edge stack behind a Caddy mirror,
   and the deploy rehearsal).
   **Approval gate**: the repo stays private on the free plan (decided 2026-11-01), so GitHub environment
   reviewers and branch protection are not available. Instead, merges to `main` only build and push images;
   **deploying is a separate `workflow_dispatch` workflow** that only the repo owner can trigger, given an
   image tag. Merging to `main` is by convention only: agents never push or merge to `main` (CLAUDE.md).
   **Least privilege for the CI key** (#25): in `authorized_keys` it is bound to
   `restrict,command="/opt/rowlens/bin/rowlens-deploy"`, which accepts only `deploy <tag>`, `rollback` and
   `status`. The compose file lives on the server and changes only through `infra/deploy/install.sh`
   (approval required), so CI decides *which* image runs, never *how*. GHCR pulls use the run's
   short-lived `GITHUB_TOKEN`, passed on stdin and logged out right after; no registry credentials
   stay on the server. The host key is pinned in `infra/deploy/known_hosts`.

## Consequences

- RowLens can be moved to another host by copying `/opt/rowlens` + volumes and changing one Caddy upstream.
- Joining `trustable_proxy` means RowLens's web container can reach trustable's `web`/`api` containers on
  that network (and vice versa). Acceptable for now; it can be replaced by a dedicated `edge` network once
  trustable's compose file is willing to declare it.
- Adding a deploy key to `deploy`'s `authorized_keys` and the Caddyfile route are shared-component
  changes → **each needs your explicit approval** with the exact diff (listed in the Phase 0 summary).

## Alternatives considered

- **Profile inside trustable's compose (AudioScribe pattern)** — couples repos; rejected.
- **Bind a host port and use `host.docker.internal`** (Caddy already has the extra_host) — the app would
  have to listen on the docker bridge IP and UFW rules would need to allow it; more fragile, rejected.
- **Separate VPS now** — cleaner, but you asked to start on the existing server. Revisit at M3.
