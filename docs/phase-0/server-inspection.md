# Phase 0 — Server inspection (read-only)

**Date**: 2026-11-01 · **Host**: `trustable-prod` (46.225.212.217, `trustable.nl` A record) ·
**Method**: SSH as `deploy`, read-only commands only (`docker ps`, `df`, `ls`, `cat`, `ss`). Nothing was
changed, restarted or pulled. A read-only look at `trustable-staging` (178.104.20.102) was also taken.

Sources: the server itself, plus the local checkouts of `ewoutbarendregt/trustable.nl` (owner of the
reverse proxy and the base compose file) and `ewoutbarendregt/audioscribe`.

## Host

| Item | Prod | Staging |
|---|---|---|
| Provider / type | Hetzner CX32, nbg1 (Nuremberg, EU) | Hetzner CX22, nbg1 |
| OS | Ubuntu 24.04.4 LTS, kernel 6.8, x86_64 | Ubuntu 24.04 |
| CPU / RAM | 4 vCPU / 7.6 GiB (≈1 GiB used, 6.6 GiB available) + 2 GiB swap | 2 vCPU / 3.7 GiB |
| Disk | 150 GB single disk, **65 GB used, 80 GB free (46 %)**; no extra block volumes | 75 GB, **74 % used, 20 GB free** |
| Load | ~0.00 (idle) | — |
| Docker | Engine 29.2.1, Compose v5.1.0 | same stack |
| Open ports | 22, 80, 443 only (Caddy publishes 80/443) | — |
| `deploy` user | member of `docker`; **no passwordless sudo** (couldn't read `ufw status`) | — |

## How the stack is deployed today

```
Internet → Hetzner firewall → UFW → caddy (trustable compose, :80/:443, Let's Encrypt)
                                      ├── trustable.nl/projects/audioscribe/* → strip prefix → audioscribe:8080
                                      ├── trustable.nl/*                       → web:8080
                                      └── api.trustable.nl                     → api:3001
```

- Everything runs in **one Compose project, `trustable`**, at `/opt/trustable/`
  (containers `trustable-{caddy,web,api,db,audioscribe}-1`; networks `trustable_proxy`, `trustable_db`).
- `docker-compose.yml` and `Caddyfile` on the server are **owned by the trustable.nl repo** and overwritten
  by its GitHub Actions deploy (scp + `docker compose up -d --remove-orphans`). The deployed Caddyfile is
  identical to the one in the repo.
- **AudioScribe** is a profile-gated service (`profiles: ["audioscribe"]`) declared in trustable's compose
  file, plus an overlay `docker-compose.audioscribe.yml` (its data volume) shipped by AudioScribe's own
  `deploy.sh`. Its deploy is a manual script from a laptop: `docker buildx --platform linux/amd64` → GHCR
  → `ssh … docker compose --profile audioscribe up -d audioscribe`. Secrets in `/opt/trustable/audioscribe.env`.
  Image tags are immutable versions (`v1.5.2`), never `latest`.
- AudioScribe conventions worth reusing: e-mail OTP login with hashed codes, session cookie scoped by
  `COOKIE_PATH=/projects/audioscribe`, mail via **Resend SMTP** with `MAIL_FROM=…@trustable.nl`.
- Caddy **strips** the `/projects/audioscribe` prefix; AudioScribe uses relative URLs only.
- Caddy sets global headers incl. HSTS, `X-Frame-Options SAMEORIGIN`, `Permissions-Policy … camera=()`.
  Caddy already has `extra_hosts: host.docker.internal:host-gateway`.
- Registry: GHCR (`ghcr.io/ewoutbarendregt/*`). Prod's stored GHCR login can't read the private
  `audioscribe` package; AudioScribe works around it with `docker save | ssh | docker load`.
- Trustable's CD runs `docker login ghcr.io` on the server with its run's `GITHUB_TOKEN`, i.e. it rewrites
  the `deploy` user's `~/.docker/config.json` every deploy.

## Data, backups, cron

- Volumes: `trustable_postgres_data`, `trustable_caddy_{data,config}`, `trustable_audioscribe_data` (79 MB total).
- `/etc/cron.d/trustable-backup`: daily 03:00 UTC `backup-db.sh` → gpg-encrypted `pg_dump` in
  `/opt/trustable/backups/` (~1.5 MB/day, 52 MB total). **Backups are on the same disk as the database**
  (no off-site copy seen). Deploys also take a plain-SQL dump before migrating.
- No monitoring/alerting agent seen (sysstat is installed). No disk alerting.

## Observations that shape RowLens

1. **Disk is the binding constraint.** A 2-minute 4K/60 phone clip is roughly 0.6–0.9 GB; with renditions
   ≈1 GB per clip. 80 GB free ≈ 80 clips. At ~10 clips/week for one club the disk is full in ~2 months, and a
   full disk takes trustable.nl and AudioScribe down too. → ADR-0006.
2. **Image sprawl**: 123 images / 63 GB on prod (59 `trustable-api`, 58 `trustable-web` tags). Not ours to
   touch, but it is most of the used disk — flagged for you.
3. `--remove-orphans` in trustable's deploy only affects the `trustable` project, so a separate `rowlens`
   Compose project is safe from it. → ADR-0002.
4. RowLens must not share the `deploy` user's Docker credential store (trustable CD overwrites it). → use a
   separate `DOCKER_CONFIG` under `/opt/rowlens`. → ADR-0002.
5. CPU is shared with trustable and AudioScribe: ffmpeg transcoding of 4K must be CPU/memory-limited. → ADR-0007.
6. Same origin `trustable.nl` for three apps: path-scoped cookies are not a security boundary. → ADR-0003.
7. Staging is at 74 % disk with 2 vCPU/4 GB: not suitable for real video volume without more storage.
