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
| `/opt/rowlens/.env` (640) | ✅ `NODE_ENV`, `PUBLIC_ORIGIN`, `BASE_PATH`, `POSTGRES_PASSWORD`, `ROWLENS_APP_DB_PASSWORD`, `SESSION_SECRET`, `PILOT_ACCESS_CODE_HASH`; plus e-mail login (2026-11-02): `AUTH_ALLOWED_EMAILS` (2 addresses, typed by Ewout in his terminal), `OTP_PEPPER` (generated on the server), `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587` (465 is blocked outbound on trustable-prod, BUG-010; changed 2026-11-02 07:34 UTC, backup `.env.bak-20261102b`), `SMTP_USER=resend`, `SMTP_PASSWORD` (the Resend key AudioScribe uses, copied on the server from `/opt/trustable/audioscribe.env` without printing it; that file was only read), `MAIL_FROM=RowLens <rowlens@trustable.nl>`. Backup before the change: `.env.bak-20261102` | Claude, 2026-11-02, approved |
| Caddy route `/projects/rowlens/*` | ✅ live since trustable.nl v0.19.1 ([#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) → release [#378](https://github.com/ewoutbarendregt/trustable.nl/pull/378)) | Claude, 2026-11-01, approved (#24) |
| `/opt/rowlens/bin/rowlens-deploy` (750), `/opt/rowlens/docker-compose.yml` (640) | ✅ installed by `infra/deploy/install.sh`; compose is byte-identical to the repo, deploy script with #98 reinstalled 2026-11-02 (CI key reported as already restricted) | Claude, 2026-11-02, approved |
| RowLens containers (project `rowlens`) | ✅ `web` + `worker` `sha-6fbd5a6` (deployed 2026-11-02 07:37 UTC; `sha-5ee4d69` at 07:16 applied migrations 0005–0006), `web` on `rowlens_internal` + `trustable_proxy` (alias `rowlens-web`), `db` (postgres:16-alpine) on `rowlens_internal` only; web and DB healthy. Previous release: `sha-5ee4d69` (pilot-code release for rollback: `sha-c15cb47`) | Claude, 2026-11-02, approved |
| Resend sender domain | ✅ `trustable.nl` verified (DKIM `resend._domainkey`, bounce MX on `send.trustable.nl`, SPF includes resend.com); AudioScribe already sends from it | checked 2026-11-02 |

Nothing under `/opt/trustable` has been changed.

## Still to do on the server

For #42 (admin access), at the deploy that contains it: add `AUTH_ADMIN_EMAILS` (the first admin's
address, entered by Ewout through a terminal prompt as before, with a `.env` backup first). Migration
0010 adds roles, the access list and its log. The two addresses in `AUTH_ALLOWED_EMAILS` keep working
as coach; they can be moved into the app's list later.

From #28–#30 (e-mail authentication): login is enabled since `sha-5ee4d69` and the first real login
worked on 2026-11-02 (`sha-6fbd5a6`, port 587); the pilot code no longer opens the app. Still to check:
the EN mail, logout and "log out other devices"; after that
`/opt/rowlens/pilot-code.txt` and `PILOT_ACCESS_CODE_HASH` can be archived. Rolling back to `sha-c15cb47`
brings the pilot code back (the variable is still there). The Resend key is shared with AudioScribe:
revoking it stops mail for both. `trustable.nl` has no DMARC record yet (a DNS change: Ewout's call).

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
