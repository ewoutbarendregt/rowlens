# Runbook: RowLens on trustable-prod

What exists on the server for RowLens, who changed it, and what is still to do. Every change to a shared
component is approved by Ewout first (CLAUDE.md). Newest changes first.

## Current state

| Item | State | Changed by / when |
|---|---|---|
| CI deploy key `gh-actions-rowlens` in `/home/deploy/.ssh/authorized_keys` | ✅ installed (#23), then **restricted** to `restrict,command="/opt/rowlens/bin/rowlens-deploy"` (#25). ED25519, fingerprint `SHA256:SB+b+yXQ47Oic7GIDcqTbJBFtSRYY+4HJWDabHuReDU` | Claude, 2026-11-01, approved |
| Backups of `authorized_keys` | `authorized_keys.bak-20261101-rowlens` (before adding the key, 4 keys); `authorized_keys.bak-20261101T115732Z` (before restricting it, 5 keys) | Claude, 2026-11-01 |
| Private key | `~/.ssh/rowlens_deploy` on Ewout's laptop | Claude, 2026-11-01 |
| GitHub secret `ROWLENS_SSH_PRIVATE_KEY` | ✅ set from `~/.ssh/rowlens_deploy` | Ewout, 2026-11-01 |
| `/opt/rowlens` (`deploy:deploy`, 750) | ✅ created with `su` (root password), since `deploy` has no sudo | Ewout, 2026-11-01 |
| `/opt/rowlens/media/`, `/opt/rowlens/.docker/` (750) | ✅ created | Claude, 2026-11-01 |
| `/opt/rowlens/.env` (640) | ✅ `NODE_ENV`, `PUBLIC_ORIGIN`, `BASE_PATH`, `POSTGRES_PASSWORD`, `ROWLENS_APP_DB_PASSWORD`, `SESSION_SECRET` (each 64 hex chars, generated on the server, never printed), `PILOT_ACCESS_CODE_HASH` (scrypt hash of the pilot code) | Claude, 2026-11-01 (last three: approved, #31/#84) |
| Caddy route `/projects/rowlens/*` | ✅ live since trustable.nl v0.19.1 ([#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) → release [#378](https://github.com/ewoutbarendregt/trustable.nl/pull/378)) | Claude, 2026-11-01, approved (#24) |
| `/opt/rowlens/bin/rowlens-deploy` (750), `/opt/rowlens/docker-compose.yml` (640) | ✅ installed by `infra/deploy/install.sh`; identical to the repo (sha256 checked) | Claude, 2026-11-01, approved (#25) |
| RowLens containers (project `rowlens`) | ✅ `web` + `worker` (`sha-4e03e66`: database, access code, upload, processing with capped renditions, player for own videos, notes; player demo on; worker capped at 2 CPUs / 2 GB) on `rowlens_internal` + `trustable_proxy` (alias `rowlens-web`), `/opt/rowlens/media` mounted at `/media`; `db` (postgres:16-alpine) on `rowlens_internal` only, migrations 0000–0002, role `rowlens_app` without BYPASSRLS. Previous release: `sha-d8b5501` | deploy runs 41305371056 (#26), 41309728753 (player demo), 41325050578 + 41325179591 (sha-5082628, then the same tag again to load the code hash), 41333980902 (sha-e6f9deb), 41336119310 (sha-d8b5501), 41340322173 (sha-4e03e66), triggered by Claude on Ewout's request, 2026-11-01 |

Nothing under `/opt/trustable` has been changed.

## Pilot access code (#84)

- The current code is in `/opt/rowlens/pilot-code.txt` (mode 600, `deploy` only); Claude never saw
  it. Ewout reads it with `ssh trustable-prod cat /opt/rowlens/pilot-code.txt` and may delete the
  file once it's shared with the club.
- **New code** (signs everyone out), each time with Ewout's approval:
  `ssh trustable-prod 'cd /opt/rowlens && umask 077 && sed -i "/^PILOT_ACCESS_CODE_HASH=/d" .env && docker run --rm --network none ghcr.io/ewoutbarendregt/rowlens-web:$(cat state/current-tag) node dist/server/pilot/code-cli.js > pilot-code.txt && grep "^PILOT_ACCESS_CODE_HASH=" pilot-code.txt >> .env && sed -i "/^PILOT_ACCESS_CODE_HASH=/d" pilot-code.txt'`,
  then redeploy the current tag (deploy workflow) so `web` reads it.
- **Close the gate**: remove the `PILOT_ACCESS_CODE_HASH` line from `.env` and redeploy; the site
  then says "not open yet" and every club route is a 404.

## Done for sha-e6f9deb (2026-11-01, on Ewout's "Merge and deploy")

1. `infra/deploy/install.sh`: compose file with the `worker` service; deploy script unchanged;
   `authorized_keys` untouched; sha256 of both files equal to the repo.
2. Deploy `sha-e6f9deb`: pre-deploy dump, migration 0003 (jobs, video metadata), ready.
3. Not done: videos uploaded before this release have no `video.process` job. Queueing them is one
   insert (below); Ewout chose to re-upload instead. If needed later, with approval:
   `ssh trustable-prod "docker exec rowlens-db-1 psql -U rowlens_owner -d rowlens -c \"insert into job (club_id, type, payload, idempotency_key) select club_id, 'video.process', jsonb_build_object('videoId', id), 'video.process:' || id from video where status = 'uploaded' on conflict (idempotency_key) do nothing\""`

Checked afterwards: `web` ready, `worker` running (NanoCpus 2e9, 2 GiB), club routes 404 without the
cookie; trustable.nl, `api.trustable.nl/api/health`, AudioScribe and the demo 200; disk 48 %.

## Done for sha-5082628 (2026-11-01, approved by Ewout)

1. `ROWLENS_APP_DB_PASSWORD` and `SESSION_SECRET` appended to `.env` (generated on the server).
2. `infra/deploy/install.sh`: compose file with `migrate` and the media mount; deploy script
   unchanged; `authorized_keys` untouched ("CI key already restricted"); sha256 of both files equal to
   the repo.
3. Deploy `sha-5082628`: pre-deploy dump, migrations 0000–0002, ready, public check passed.
4. Access code generated in a `--network none` container into `pilot-code.txt`; hash into `.env`;
   same tag redeployed. Gate `enabled: true`; wrong code → 403; club routes 404 without access.

Checked afterwards: trustable.nl 200, `api.trustable.nl/api/health` 200, AudioScribe 200, all
trustable containers untouched; `web` (uid 1000) can write `/media`; disk 47 %.

## Verified restrictions of the CI key (2026-11-01)

`status` runs; `ls /`, `deploy sha-abc1234; id`, an interactive shell and `deploy latest` are refused
(exit 64); remote port forwarding is refused. The other four keys are byte-identical to the backup.

## Deploying (#25)

- **Deploy**: GitHub → Actions → **deploy** → Run workflow, tag `sha-<7>` (shown in the `images` run summary
  after a merge to `main`).
- **Status**: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy status`
- **Roll back** to the previous release: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy rollback`
- Pre-deploy database dumps: `/opt/rowlens/backups/pre-deploy-*.dump` (newest 10 kept).

## Root access

`deploy` has no passwordless sudo and root can't log in over SSH (`PermitRootLogin no`). For root-only
steps, switch with `su` inside a `deploy` session (asks for the root password):

```bash
ssh -t trustable-prod "su -c '<command>'"
```

How `/opt/rowlens` was created (2026-11-01):

```bash
ssh -t trustable-prod "su -c 'install -d -o deploy -g deploy -m 750 /opt/rowlens'"
```

## How `/opt/rowlens/.env` was created

Secrets are generated on the server and never printed:

```bash
ssh trustable-prod 'set -e; umask 027; f=/opt/rowlens/.env; test ! -e $f
{ echo "# RowLens production environment (#23). Mode 640, owner deploy. Never commit."
  echo "NODE_ENV=production"
  echo "PUBLIC_ORIGIN=https://trustable.nl"
  echo "BASE_PATH=/projects/rowlens"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"; } > $f; chmod 640 $f; cut -d= -f1 $f'
```

## Rollback

- Key restriction only: `cp -p ~/.ssh/authorized_keys.bak-20261101T115732Z ~/.ssh/authorized_keys`.
- Deploy key entirely: `cp -p ~/.ssh/authorized_keys.bak-20261101-rowlens ~/.ssh/authorized_keys` on the server,
  then delete the GitHub secret.
- Caddy route: revert trustable.nl#377 and release; or, before release, close the PR.
- Directory: `rm -r /opt/rowlens` (destructive; only with explicit approval once data exists).

## Follow-ups

- Changes to `rowlens-deploy` or the prod compose file reach the server only by rerunning
  `infra/deploy/install.sh` (approval required); CI can't change them.
- Host and pinned host key live in the repo (`.github/workflows/deploy.yml`, `infra/deploy/known_hosts`).
