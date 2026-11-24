# Runbook: RowLens on the production server

What exists on the server for RowLens, who changed it, and what is still to do. Production is
`trustable-contabo` (144.91.87.103) since 2026-11-24; older sections describe the Hetzner host
`trustable-prod`. Every change to a shared component is approved by Ewout first (AGENTS.md). Newest
changes first.

## Examples in the training list deployed — 2026-11-17 20:28 UTC

Ewout requested "merge en deploy" and, asked about the red dependency audit, answered "Ja, merge en
deploy". [#193](https://github.com/ewoutbarendregt/rowlens/pull/193) squash-merged as 66b4692. Main
images [44167704101](https://github.com/ewoutbarendregt/rowlens/actions/runs/44167704101) succeeded;
main CI [44167704250](https://github.com/ewoutbarendregt/rowlens/actions/runs/44167704250) passed every
test and E2E step and failed only `pnpm audit --audit-level high` on the new picomatch advisory
GHSA-fc5q-39xc-vjpf (dev tooling via typescript-eslint, no patched version). Deploy
[44169494655](https://github.com/ewoutbarendregt/rowlens/actions/runs/44169494655) with the public
URL check succeeded: **0.0.67 / sha-66b4692**. Backup
`/opt/rowlens/backups/pre-deploy-20261117T202754Z-sha-66b4692.dump`; no new migration (32), 3 examples.
Readiness reports the new SHA with DB ok; only rowlens-web/worker changed tag, the 7 other containers
kept their images and uptime. trustable.nl, API health, AudioScribe and RowLens return 200. Read-only
verification; no configuration or one-off database change.

## Help examples and publisher feedback deployed — 2026-11-16 21:43 UTC

Ewout requested “Merge en deploy”. #190/ece7f78 and #191/a42e2f1 are merged. #191's renewed
CI43959546925 passed all9 checks; final main CI43961095292 and images43961095148 succeeded.
[Deploy43962861520](https://github.com/ewoutbarendregt/rowlens/actions/runs/43962861520) released
**0.0.65 /sha-a42e2f1**, ready21:43:25 UTC. Automatic DB backup completed at
`/opt/rowlens/backups/pre-deploy-20261116T214314Z-sha-a42e2f1.dump`; migrations advanced30→32.
Both RowLens web/worker use the new tag; readiness reports DB ok and build-info reports0.0.65.

Migration0031 synchronously attributed all3 existing examples to their recorded publishers;0032
adds protected existing-training publication. Pre/post stored publisher-material aggregates are
unchanged:162 lines,1 arrow,4 angles. No asynchronous backfill was introduced. Publication functions
have the trusted table owner; the classification trigger is invoker-context as designed. Help now
supports create/edit/rename/existing-selection and examples show publisher feedback read-only.

All7 other containers, including RowLens DB, Caddy, trustable.nl, API, AudioScribe and Feelz, retain
identical images and start times. Site/API health/AudioScribe return200. No shared/server configuration,
manual database mutation, production OTP or email was used. Production verification covers public
health/version, container metadata and read-only DB aggregates; interactive behavior is covered by
local/CI717 web/DB and115 browser cases plus Linux9. The known release-PR workflow failure is
unchanged; required CI/images/deploy succeeded. These records belong to the next documentation PR.

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

## Current state (Hetzner, until 2026-11-24)

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

## Deploying (local, since 2026-11-24)

Production is the Contabo VPS **144.91.87.103** (`ssh trustable-contabo`, user `deploy`, uid 1002)
since 2026-11-24; the Hetzner host 46.225.212.217 (`trustable-prod`) is only a Caddy forwarder now,
its app containers stopped. RowLens there: compose project `rowlens` in `/opt/rowlens`
(`docker-compose.yml`, `.env`, `state/{current-tag,previous-tag,release.env}`, `bin/rowlens-deploy`,
`backups/`, `media/` owned by uid 1000), web on `trustable_proxy` behind Caddy.

Only on Ewout's explicit request, each time. From the repo on Ewout's Mac (Docker with buildx):

```bash
scripts/deploy.sh prod --dry-run                 # build + read-only preflight, changes nothing
scripts/deploy.sh prod                           # deploy origin/main (asks for confirmation)
scripts/deploy.sh prod --ref <sha|branch|tag>    # deploy another ref
```

It builds `ghcr.io/ewoutbarendregt/rowlens-{web,worker}:sha-<7>` for linux/amd64 from a temporary
worktree (the names are only local tags; nothing is pushed to GHCR), loads them on the server with
`docker save | gzip | ssh … docker load`, runs `/opt/rowlens/bin/rowlens-deploy deploy sha-<7>` with
`ssh -n` (backup → migrate → `up --pull never` → readiness → keep or roll back), and checks the end
marker, the running image tags and `https://trustable.nl/projects/rowlens/health/live`. The displayed
release continues from the highest `org.opencontainers.image.version` label among the RowLens web
images on the server (+1 for a new commit, unchanged for a redeploy; `ROWLENS_RELEASE_SEQ=<n>`
overrides), see ADR-0027.

Preflight warns when the server's `rowlens-deploy` or compose file differ from the ref (update them
with `infra/deploy/install.sh`, approval required) and when the rollback target's images are not on
the server.

- **Status**: `ssh trustable-contabo /opt/rowlens/bin/rowlens-deploy status`
- **Roll back** to the previous release: `ssh trustable-contabo /opt/rowlens/bin/rowlens-deploy rollback`
  (only with Ewout's yes)
- Pre-deploy database dumps: `/opt/rowlens/backups/pre-deploy-*.dump` (newest 10 kept).

Until 2026-11-24 deploys ran from GitHub Actions (`images` pushed to GHCR, `deploy` SSHed to
Hetzner with the forced-command CI key below). Those workflows are removed; the CI key and the
`ROWLENS_SSH_PRIVATE_KEY` secret are not used any more, and the Contabo `deploy` user has no
RowLens CI key.

## Recent deployments

- **2026-11-21 15:49 UTC — `sha-1a36f75`** ([#195](https://github.com/ewoutbarendregt/rowlens/pull/195):
  RowLens admin's notes on examples visible to members of the owning club, BUG-074). Deploy run
  [44921182532](https://github.com/ewoutbarendregt/rowlens/actions/runs/44921182532) succeeded;
  migration 0033 applied (33 migrations, `rowlens_published_example_annotation` present).
  `/health/ready` returned `sha-1a36f75` with `db: ok`; `rowlens-web` and `rowlens-worker` run that
  tag; `https://trustable.nl/`, `https://api.trustable.nl/api/health` and AudioScribe returned 200;
  trustable and AudioScribe containers untouched (up 13 days). Pre-deploy dump
  `pre-deploy-20261121T154923Z-sha-1a36f75.dump`.
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
  `infra/deploy/install.sh` (approval required); a deploy never changes them.
- The retired CI key (`gh-actions-rowlens`, Hetzner only) and the GitHub secret
  `ROWLENS_SSH_PRIVATE_KEY` can be deleted (Ewout's call; Hetzner's `authorized_keys` is shared).
