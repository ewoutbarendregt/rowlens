# Runbook: RowLens on trustable-prod

What exists on the server for RowLens, who changed it, and what is still to do. Every change to a shared
component is approved by Ewout first (CLAUDE.md). Newest changes first.

## Current state

| Item | State | Changed by / when |
|---|---|---|
| CI deploy key `gh-actions-rowlens` in `/home/deploy/.ssh/authorized_keys` | ✅ installed. ED25519, fingerprint `SHA256:SB+b+yXQ47Oic7GIDcqTbJBFtSRYY+4HJWDabHuReDU` | Claude, 2026-11-01, approved (#23) |
| Backup of the previous `authorized_keys` | `/home/deploy/.ssh/authorized_keys.bak-20261101-rowlens` (4 keys) | Claude, 2026-11-01 |
| Private key | `~/.ssh/rowlens_deploy` on Ewout's laptop | Claude, 2026-11-01 |
| GitHub secret `ROWLENS_SSH_PRIVATE_KEY` | ⏳ **to do, Ewout** (the agent isn't allowed to write secret stores) | — |
| `/opt/rowlens` (`deploy:deploy`, 750) | ✅ created with `su` (root password), since `deploy` has no sudo | Ewout, 2026-11-01 |
| `/opt/rowlens/media/`, `/opt/rowlens/.docker/` (750) | ✅ created | Claude, 2026-11-01 |
| `/opt/rowlens/.env` (640) | ✅ `NODE_ENV`, `PUBLIC_ORIGIN`, `BASE_PATH`, `POSTGRES_PASSWORD` (64 hex chars, generated on the server, never printed) | Claude, 2026-11-01 |
| Caddy route `/projects/rowlens/*` | ⏳ [trustable.nl#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) open against `develop`; live after the next trustable `develop` → `main` release | Claude, 2026-11-01, approved (#24) |
| RowLens containers | ❌ none yet; first deploy is #26, which needs separate approval | — |

Nothing under `/opt/trustable` has been changed.

## Steps for Ewout

1. Store the deploy key as a GitHub Actions secret (the value goes straight from the file to GitHub):

   ```bash
   gh secret set ROWLENS_SSH_PRIVATE_KEY -R ewoutbarendregt/rowlens < ~/.ssh/rowlens_deploy
   ```

2. Merge [trustable.nl#377](https://github.com/ewoutbarendregt/trustable.nl/pull/377) when you're ready. It
   goes live with the next trustable release, which also redeploys trustable's web and api.

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

- Deploy key: `cp -p ~/.ssh/authorized_keys.bak-20261101-rowlens ~/.ssh/authorized_keys` on the server,
  then delete the GitHub secret.
- Caddy route: revert trustable.nl#377 and release; or, before release, close the PR.
- Directory: `rm -r /opt/rowlens` (destructive; only with explicit approval once data exists).

## Follow-ups

- Restrict the deploy key with a forced command (`command="/opt/rowlens/bin/deploy",restrict`) once the
  deploy script exists (#25). Until then it is a full `deploy` shell, the same as trustable's CI key.
- CD also needs `ROWLENS_VPS_HOST` and a pinned `known_hosts` entry (#25).
