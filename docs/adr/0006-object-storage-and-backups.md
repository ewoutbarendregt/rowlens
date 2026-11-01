# ADR-0006: Object storage, disk safety and backups

- **Status**: proposed — **needs your decision on the storage backend**
- **Date**: 2026-11-01

## Context

- Prod has **80 GB free on a single 150 GB disk** shared with trustable.nl and AudioScribe (staging: 20 GB).
- Sizing: 2-min clip, 4K/60 phone ≈ 40–60 Mbit/s → **0.6–0.9 GB original**; renditions (1080p short-GOP
  ≈ 0.2 GB, 540p ≈ 0.05 GB, poster/thumbs) → **≈1 GB per clip** worst case, ≈0.3 GB at 1080p/30.
- 30 users, ~10 clips/week → ~0.5 TB/year. The local disk fills in about two months and a full disk takes
  all three apps down.
- Retention is unlimited; users can hard-delete their own videos.

## Decision

1. All video bytes go through a **`BlobStore` interface (S3 API)**. Code never touches file paths for
   media. Keys: `clubs/{clubId}/videos/{videoId}/{original|renditions/…|analysis/{runId}/…}`.
2. **Backend (recommended): Hetzner Object Storage** (S3-compatible, EU — nbg1/fsn1/hel1), bucket
   `rowlens-prod`, private, served only through the app. Keeps video off the shared disk entirely.
   *Alternative*: a **Hetzner Volume** (block storage, resizable) mounted at `/mnt/rowlens` with **MinIO**
   in our compose project. Either way the root disk is never used for media.
   *Dev/CI*: MinIO container. (Prices change; verify current Hetzner pricing before choosing.)
3. **Quotas**: per-club storage quota (configurable; default 200 GB) and per-upload size cap (default
   4 GB). Uploads are refused when the quota or the storage-health threshold is exceeded.
4. **Disk/capacity monitoring**: a cron job (RowLens-owned) checks root-disk use and bucket/volume use;
   e-mails an alert at 75 % and 85 %, and the app enters "uploads paused" mode at 90 %. Metric exported.
5. **Database backups**: nightly `pg_dump -Fc`, gpg-encrypted (same pattern as trustable's
   `backup-db.sh`), **copied off-server** (second bucket in another Hetzner location, or a Storage Box),
   30 daily + 12 monthly retained. A weekly automated **restore test** restores the latest dump into a
   throwaway Postgres container and runs a row-count/sanity query; failure alerts.
6. **Video backups**: originals are the only irreplaceable bytes (renditions and analysis artefacts can be
   regenerated). Originals are replicated nightly to a bucket in a **different location** (rclone),
   honouring hard deletes within 24 h (so "delete" really deletes, and we document that window).

## Consequences

- Object storage adds a small monthly cost but removes the main availability risk for the whole server.
- Video playback goes through the app (range proxy or short-lived presigned URLs, ADR-0007).
- Deletion is a two-step job (DB row + all keys under the video prefix + backup replica), audited.

## Open questions for you

- Object Storage vs. Volume+MinIO? Budget ceiling per month?
- Is a 24 h deletion lag in the backup replica acceptable for the privacy statement?
