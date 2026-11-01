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
| `/opt/rowlens/.env` (640) | ✅ `NODE_ENV`, `PUBLIC_ORIGIN`, `BASE_PATH`, `POSTGRES_PASSWORD`, `ROWLENS_APP_DB_PASSWORD`, `SESSION_SECRET`, `PILOT_ACCESS_CODE_HASH`; key names only rechecked, values not read | Claude; read-only recheck by Codex, 2026-11-01 |
| Caddy route `/projects/rowlens/*` | ✅ live since trustable.nl v0.19.1 ([#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) → release [#378](https://github.com/ewoutbarendregt/trustable.nl/pull/378)) | Claude, 2026-11-01, approved (#24) |
| `/opt/rowlens/bin/rowlens-deploy` (750), `/opt/rowlens/docker-compose.yml` (640) | ✅ installed by `infra/deploy/install.sh`; compose is byte-identical to the repo, deploy script predates #98 and must be reinstalled at the next approved deploy | Claude; read-only sha256 recheck by Codex, 2026-11-01 |
| RowLens containers (project `rowlens`) | ✅ `web` (`rowlens-web:sha-c15cb47`) on `rowlens_internal` + `trustable_proxy` (alias `rowlens-web`), `db` (postgres:16-alpine) on `rowlens_internal` only, worker running; web and DB healthy. Previous release: `sha-4e03e66` | read-only recheck by Codex, 2026-11-01 |

Nothing under `/opt/trustable` has been changed.

## Needed before the next deploy (each step shown to Ewout and approved first)

From #31 (database roles): `ROWLENS_APP_DB_PASSWORD` is already present and the production compose is
current. Reinstall with `infra/deploy/install.sh` once at the next approved deploy to update only the
deploy script with #98; the installer verifies the CI key and should report it as already restricted.

From #28–#30 (e-mail authentication), not done yet:
3. Ewout supplies the comma-separated first-club member addresses and a dedicated Resend API key.
   Confirm in Resend that `trustable.nl` is verified before any real address is added.
4. After showing the exact edit and receiving approval, add only these RowLens variables to
   `/opt/rowlens/.env` (SMTP values follow [Resend's official settings](https://resend.com/docs/send-with-smtp)):

   ```dotenv
   AUTH_ALLOWED_EMAILS=first@example.com,second@example.com
   OTP_PEPPER=<64 hex characters generated with openssl rand -hex 32>
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASSWORD=<dedicated Resend API key>
   MAIL_FROM=RowLens <rowlens@trustable.nl>
   ```

   Production refuses to start with an allowlist but incomplete SMTP settings. The API key must not
   be passed on a command line or printed. Keep the old pilot variables for rollback until OTP mail is
   verified; when auth is enabled, its routes and tenant guard take precedence.
5. Migration 0006 provisions an allowlisted address on its first request. Test a real NL and EN login,
   logout and "log out other devices" before archiving `/opt/rowlens/pilot-code.txt`.

From #45 (upload): nothing new on the server. `/opt/rowlens/media` exists, owned by `deploy`
(uid 1000, the image's `node` user; checked read-only 2026-11-01), and step 2's compose file mounts
it into `web`. Disk then: 150 GB, 47 % used; uploads pause at 85 %.

The app database password is already configured. The first deploy containing the pending migrations
creates or updates the `rowlens_app` role, applies migrations through 0006 and starts `web` with that role.

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
