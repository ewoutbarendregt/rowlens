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
| `/opt/rowlens/.env` (640) | ✅ `NODE_ENV`, `PUBLIC_ORIGIN`, `BASE_PATH`, `POSTGRES_PASSWORD`, `ROWLENS_APP_DB_PASSWORD`, `SESSION_SECRET`, `PILOT_ACCESS_CODE_HASH`; plus e-mail login (2026-11-02): `AUTH_ALLOWED_EMAILS` (2 addresses, typed by Ewout in his terminal), `AUTH_ADMIN_EMAILS` (first admin, added before `sha-96a0202` with a backup), `OTP_PEPPER` (generated on the server), `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587` (465 is blocked outbound on trustable-prod, BUG-010; changed 2026-11-02 07:34 UTC, backup `.env.bak-20261102b`), `SMTP_USER=resend`, `SMTP_PASSWORD` (the Resend key AudioScribe uses, copied on the server from `/opt/trustable/audioscribe.env` without printing it; that file was only read), `MAIL_FROM=RowLens <rowlens@trustable.nl>`. Backup before the e-mail change: `.env.bak-20261102` | Claude, 2026-11-02, approved |
| Caddy route `/projects/rowlens/*` | ✅ live since trustable.nl v0.19.1 ([#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) → release [#378](https://github.com/ewoutbarendregt/trustable.nl/pull/378)) | Claude, 2026-11-01, approved (#24) |
| `/opt/rowlens/bin/rowlens-deploy` (750), `/opt/rowlens/docker-compose.yml` (640) | ✅ installed by `infra/deploy/install.sh`; compose is byte-identical to the repo, deploy script with #98 reinstalled 2026-11-02 (CI key reported as already restricted) | Claude, 2026-11-02, approved |
| RowLens containers (project `rowlens`) | ✅ `web` + `worker` `sha-ddb90fd` (deployed 2026-11-05 23:41 UTC); web healthy; DB healthy, PostgreSQL 16.15, 18 migrations. Web joins `rowlens_internal` + `trustable_proxy`; DB stays internal. Previous release: `sha-5ef325b`. | Codex, 2026-11-06, approved |
| Resend sender domain | ✅ `trustable.nl` verified (DKIM `resend._domainkey`, bounce MX on `send.trustable.nl`, SPF includes resend.com); AudioScribe already sends from it | checked 2026-11-02 |

Nothing under `/opt/trustable` has been changed.

## Still to do on the server

For #42 (admin access), `AUTH_ADMIN_EMAILS` is configured and migration 0010 is live. The two
addresses in `AUTH_ALLOWED_EMAILS` keep working as coach; they can be moved into the app's access
list later.

From #28–#30 (e-mail authentication): login is enabled since `sha-5ee4d69` and the first real login
worked on 2026-11-02 (`sha-6fbd5a6`, port 587); the pilot code no longer opens the app. Still to check:
the EN mail, logout and "log out other devices"; after that
`/opt/rowlens/pilot-code.txt` and `PILOT_ACCESS_CODE_HASH` can be archived. Rolling back to `sha-c15cb47`
brings the pilot code back (the variable is still there). The Resend key is shared with AudioScribe:
revoking it stops mail for both. `trustable.nl` has no DMARC record yet (a DNS change: Ewout's call).

From #45 (upload): nothing new on the server. `/opt/rowlens/media` exists, owned by `deploy`
(uid 1000, the image's `node` user; checked read-only 2026-11-01), and step 2's compose file mounts
it into `web`. Disk then: 150 GB, 47 % used; uploads pause at 85 %.

The app database password is configured. The deploy script creates or updates the `rowlens_app` role,
applies migrations before starting the app (through 0017, 18 total, in `sha-ddb90fd`) and starts `web` with that
role.

## Verified restrictions of the CI key (2026-11-01)

`status` runs; `ls /`, `deploy sha-abc1234; id`, an interactive shell and `deploy latest` are refused
(exit 64); remote port forwarding is refused. The other four keys are byte-identical to the backup.

## Deploying (#25)

- **Deploy**: GitHub → Actions → **deploy** → Run workflow, tag `sha-<7>` (shown in the `images` run summary
  after a merge to `main`).
- **Status**: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy status`
- **Roll back** to the previous release: `ssh trustable-prod /opt/rowlens/bin/rowlens-deploy rollback`
- Pre-deploy database dumps: `/opt/rowlens/backups/pre-deploy-*.dump` (newest 10 kept).

## Recent deployments

- **2026-11-05 23:41 UTC (2026-11-06 00:41 CET) — `sha-ddb90fd`** (#144–#147: unobstructed editing,
  iPhone playback-button activation, explicit stroke-mark deletion and direct drawing points).
  Ewout explicitly requested "Merge en deploy". Final main CI
  [42128677789](https://github.com/ewoutbarendregt/rowlens/actions/runs/42128677789) and images
  [42128677869](https://github.com/ewoutbarendregt/rowlens/actions/runs/42128677869) passed; deploy
  [42131217348](https://github.com/ewoutbarendregt/rowlens/actions/runs/42131217348) succeeded.
  Standard pre-deploy backup completed; 18 migrations remain (no new migration). Readiness returns
  `sha-ddb90fd`, DB ok; web/worker run the matching tag, web healthy. The deploy recreated the
  RowLens DB container, now healthy on PostgreSQL 16.15. Readiness, RowLens, trustable.nl, the API
  health endpoint and AudioScribe all returned 200; all five shared-service container IDs/start
  times are unchanged. No manual server configuration or shared-service changes. CI package
  download stalls required fresh-runner retries (BUG-025); no checks were weakened. Physical
  iPhone confirmation of BUG-022 and finger dragging remains pending.
- **2026-11-05 14:55 UTC — `sha-5ef325b`** (#142: move a saved drawing on the picture, the rower in
  the picture). Images run
  [42048365629](https://github.com/ewoutbarendregt/rowlens/actions/runs/42048365629) published
  matching web and worker images; deploy run
  [42049743130](https://github.com/ewoutbarendregt/rowlens/actions/runs/42049743130) succeeded, no
  migration (still 18). Verification: `/health/ready` returned `sha-5ef325b` with `db: ok`;
  `rowlens-web` and `rowlens-worker` run that tag and are healthy; `https://trustable.nl/`,
  `https://api.trustable.nl/api/health`, AudioScribe and RowLens returned 200; the trustable
  containers were not restarted.
- **2026-11-05 — `sha-b6e18a6`** (#139: jump to the previous / next stroke moment). Deploy run
  [41799144428](https://github.com/ewoutbarendregt/rowlens/actions/runs/41799144428); 18 migrations;
  readiness ok with `db` ok, the other apps untouched.
- **2026-11-04 — `sha-09d4bf6`** (#138: the boat line per frame). Deploy run
  [41764905798](https://github.com/ewoutbarendregt/rowlens/actions/runs/41764905798), migration 0017;
  the backfill found a line in 4361 of 8292 frames of the 5 videos then in production.
- **2026-11-03 — `sha-7786aa2`** (#137: zoom into part of the picture). Deploy run
  [41718888929](https://github.com/ewoutbarendregt/rowlens/actions/runs/41718888929).
- **2026-11-03 — `sha-f52e226`** (#136: names, default boat, renaming, videos first). Deploy run
  [41707591758](https://github.com/ewoutbarendregt/rowlens/actions/runs/41707591758), 17 migrations.
- **2026-11-03 — `sha-26bdd35`** (#135: boat lines per moment, drawing for fingers). Deploy run
  [41694284305](https://github.com/ewoutbarendregt/rowlens/actions/runs/41694284305), migration 0015
  (production's 2 boat lines now start at frame 0).
- **2026-11-02 20:51 UTC — `sha-ee73740`**: PRs #124 and #125. Images run
  [41522555255](https://github.com/ewoutbarendregt/rowlens/actions/runs/41522555255) published matching
  web and worker images; deploy run
  [41522914840](https://github.com/ewoutbarendregt/rowlens/actions/runs/41522914840) succeeded. Public
  verification: RowLens `/health/ready` returned 200 with version `sha-ee73740` and `db: ok`;
  `https://trustable.nl/`, `https://api.trustable.nl/api/health` and AudioScribe returned 200. The
  RowLens web and database containers were healthy; nothing under `/opt/trustable` was changed.

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
