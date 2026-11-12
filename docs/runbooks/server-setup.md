# Runbook: RowLens on trustable-prod

## Completed CI-feedback release — 2026-11-12 10:28 UTC

On Ewout's explicit "Merge en deploy" request, #182 merged as dd617c6 after all nine checks
passed in PR CI 42882969569. Main CI [43199453228](https://github.com/ewoutbarendregt/rowlens/actions/runs/43199453228)
passed in 6m50s; both release images passed in [43199453539](https://github.com/ewoutbarendregt/rowlens/actions/runs/43199453539).
Manual deploy [43200553850](https://github.com/ewoutbarendregt/rowlens/actions/runs/43200553850)
completed at 10:28:17 UTC in 41s, using `gh workflow run deploy.yml --ref main -f tag=sha-dd617c6 -f check_public_url=true`.

Production: **0.0.61**, both RowLens images **sha-dd617c6**; readiness DB ok; **28 migrations**
unchanged. The normal pre-deploy dump was written at
`/opt/rowlens/backups/pre-deploy-20261112T102800Z-sha-dd617c6.dump`; no new schema migration,
server configuration or shared-service change. RowLens readiness, trustable.nl, API health and
AudioScribe all return HTTP 200. Seven protected containers (RowLens DB, five trustable/AudioScribe,
Feelz) retain exactly their prior IDs, start times and image references. Only RowLens web/worker
were replaced. Previous production release was 0.0.60/sha-4b5530d. No rollback was needed.

The CI graph now runs independent suites together and uses a conservative short path for
Markdown-only documentation changes. Main code/configuration changes still get all suites.
No additional merge/deployment is authorized by this completed release.

What exists on the server for RowLens, who changed it, and what is still to do. Every change to a shared
component is approved by Ewout first (CLAUDE.md). Newest changes first.

## Numeric release metadata prepared locally — 2026-11-10

No server change or additional deployment. The image workflow now prepares a numeric visible
release from its stable build counter (ADR-0027). After its future approved rollout, confirm the
numeric value in public build-info.json and the login/header; readiness continues to report the
immutable image SHA used by the existing deploy gate. OCI version labels identify the corresponding
numeric release for both images. Production currently remains sha-b9c983c (#177, deploy42789959357,
2026-11-10 09:21:30 UTC), with 28 migrations; deployment log PR #178 is separate.

## Completed production repair — 2026-11-07 20:17 UTC

Ewout explicitly approved the pinned kernel update and whole-server reboot. After an initial
unsuccessful authentication attempt, the retried native Terminal operation exited 0 and scheduled
the reboot. Fresh SSH confirms **6.8.0-149-generic**, a changed boot ID, all four packages at
**6.8.0-149.149**, retained 147 image/initrd and an empty dpkg audit. All **8** containers returned
on their same images; Docker/UFW are active. RowLens readiness is **sha-a47111c**, DB ok; all
aggregate counts and permission checks match the pre-reboot baseline, including **26 migrations**.
Five public HTTP checks pass: readiness, trustable.nl, API health, AudioScribe and signup club
listing (WVIJburg). No production signup/email was sent. BUG-054 is fixed for this host; BUG-055
and other maintenance findings remain open. No staging host was checked or modified.

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
| RowLens containers (project `rowlens`) | ✅ `web` + `worker` `sha-a47111c` (2026-11-07 19:20 UTC), signup enabled, 26 migrations; web and DB healthy. Previous release: `sha-dd71f78`. Networks unchanged. | Codex, 2026-11-07, approved |
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
applies migrations before starting the app (through 0012 in `sha-ee73740`) and starts `web` with that
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

- **2026-11-07 19:20 UTC — `sha-a47111c`** ([#159](https://github.com/ewoutbarendregt/rowlens/pull/159):
  explicit signup, optional club choice and global/club request review; lower documentation #158).
  PR CI [42403762182](https://github.com/ewoutbarendregt/rowlens/actions/runs/42403762182), main CI
  [42404700506](https://github.com/ewoutbarendregt/rowlens/actions/runs/42404700506) and images
  [42404700521](https://github.com/ewoutbarendregt/rowlens/actions/runs/42404700521) pass; deploy
  [42405660947](https://github.com/ewoutbarendregt/rowlens/actions/runs/42405660947) succeeds.
  Migration **0025**, **26 total**; readiness/version/auth status ok. Preserved 6 accounts/memberships,
  4 sessions, 5 videos, 13 compatibility identities (7 unlinked), 10 seats, 8 angles, 1 global admin.
  Public signup checked on laptop/iPhone WebKit without sending OTP. Shared containers unchanged,
  three neighbour URLs 200; no .env/compose edit or bootstrap. Read-only security review found
  existing critical kernel advisory BUG-054 and maintenance backlog BUG-055, unrelated to bot PRs.
  See [the report](../security/2026-11-07-production-dependabot-review.md); no host/firewall upgrade
  or shared-service reconfiguration performed. Further mitigation requires separate approval.

- **2026-11-07 17:56 UTC — `sha-dd71f78`** ([#157](https://github.com/ewoutbarendregt/rowlens/pull/157):
  unified accounts, scoped Users table/editor and club lifecycle). Main CI
  [42397829809](https://github.com/ewoutbarendregt/rowlens/actions/runs/42397829809) and images
  [42397829884](https://github.com/ewoutbarendregt/rowlens/actions/runs/42397829884) passed; deploy
  [42398709787](https://github.com/ewoutbarendregt/rowlens/actions/runs/42398709787) succeeded.
  Both release-image feature flags are enabled; no installed compose/.env edit. Migrations
  **0020–0024**, **25 total**. Readiness reports the new tag/DB ok; auth status unified/enabled.
  Existing 6 accounts, 6 memberships, 4 sessions, 5 videos, 7 historical identities, 10 seats and
  8 angles preserved. All 7 historical identities await explicit account mapping. The separately
  shown/approved image-bound operator bootstrap completed with hidden terminal input: **1 global
  administrator and 1 bootstrap audit**, no address recorded. Shared-container IDs/start times/
  images unchanged; neighbouring three public URLs return 200. Authenticated production browser
  and physical iPhone verification remain manual follow-up.

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
