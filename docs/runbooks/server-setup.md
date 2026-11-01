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
| `/opt/rowlens/.env` (640) | ✅ `NODE_ENV`, `PUBLIC_ORIGIN`, `BASE_PATH`, `POSTGRES_PASSWORD` (64 hex chars, generated on the server, never printed) | Claude, 2026-11-01 |
| Caddy route `/projects/rowlens/*` | ✅ live since trustable.nl v0.19.1 ([#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) → release [#378](https://github.com/ewoutbarendregt/trustable.nl/pull/378)) | Claude, 2026-11-01, approved (#24) |
| `/opt/rowlens/bin/rowlens-deploy` (750), `/opt/rowlens/docker-compose.yml` (640) | ✅ installed by `infra/deploy/install.sh`; identical to the repo (sha256 checked) | Claude, 2026-11-01, approved (#25) |
| RowLens containers (project `rowlens`) | ✅ `web` (`rowlens-web:sha-94af6b0`, player demo on) on `rowlens_internal` + `trustable_proxy` (alias `rowlens-web`), `db` (postgres:16-alpine) on `rowlens_internal` only; both healthy. Previous release: `sha-1acc1a2` | deploy runs 41305371056 (first, #26) and 41309728753 (player demo), triggered by Claude on Ewout's request, 2026-11-01 |

Nothing under `/opt/trustable` has been changed.

## Needed before the next deploy (each step shown to Ewout and approved first)

From #31 (database roles), not done yet:
1. Add `ROWLENS_APP_DB_PASSWORD` to `/opt/rowlens/.env`, generated on the server and never printed:
   `ssh trustable-prod 'f=/opt/rowlens/.env; grep -q ^ROWLENS_APP_DB_PASSWORD= $f || echo "ROWLENS_APP_DB_PASSWORD=$(openssl rand -hex 32)" >> $f; cut -d= -f1 $f'`
2. Reinstall the compose file, which now has the `migrate` service: `infra/deploy/install.sh`.

From #84 (pilot access code):
3. Add `SESSION_SECRET` the same way (`openssl rand -hex 32`, never printed).
4. Ewout creates the access code, so only he sees it. After the deploy, on the server:
   `cd /opt/rowlens && docker compose run --rm --no-deps web node dist/server/pilot/code-cli.js`
   prints `code: …` (give it to the club) and a `PILOT_ACCESS_CODE_HASH=scrypt.…` line to append to
   `/opt/rowlens/.env`; then `rowlens-deploy deploy <same tag>` restarts `web` with it. Until then the
   gate says "not open yet". A new code later = the same steps; it signs everyone out.

Without step 1, the deploy stops at `compose pull` ("ROWLENS_APP_DB_PASSWORD is required") and nothing
changes. The first deploy afterwards creates `rowlens_app`, applies `0000_init` and switches `web` to it.

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
