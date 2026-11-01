# ADR-0006: Object storage, disk safety and backups

- **Status**: accepted (2026-11-01). Pilot choice: local disk with a hard cap and no video backup.
- **Date**: 2026-11-01

## Context

- Prod has **80 GB free on a single 150 GB disk** shared with trustable.nl and AudioScribe (staging: 20 GB).
- Sizing: 2-min clip, 4K/60 phone ≈ 40–60 Mbit/s → **0.6–0.9 GB original**; renditions (1080p short-GOP
  ≈ 0.2 GB, 540p ≈ 0.05 GB, poster/thumbs) → **≈1 GB per clip** worst case, ≈0.3 GB at 1080p/30.
- 30 users, ~10 clips/week → ~0.5 TB/year. Without a cap, the local disk fills in about two months, and a
  full disk takes all three apps down.
- Retention is unlimited; users can hard-delete their own videos.

## Decision

1. All video bytes go through a **`BlobStore` interface (S3 API)**. Code never touches file paths for
   media. Keys: `clubs/{clubId}/videos/{videoId}/{original|renditions/…|analysis/{runId}/…}`.
2. **Backend for the pilot: MinIO on the local root disk**, in the `rowlens` Compose project, with data in
   `/opt/rowlens/media` and bucket `rowlens-prod`. It is internal only and served solely through the app.
   Local disk was chosen to avoid extra cost and server changes for the pilot. MinIO keeps the code path
   identical to a hosted S3 backend, so a later move to Hetzner Object Storage or a Volume is `mc mirror`
   plus a config change. Dev/CI use the same MinIO image.
3. **Hard cap: 30 GB of RowLens media in total** (env `MEDIA_CAP_BYTES`), about 30–40 clips at 4K or about
   100 at 1080p. It is enforced in two places:
   - the app refuses an upload whose declared size would exceed the remaining cap, before accepting bytes
     (tus `Upload-Length`);
   - MinIO hard bucket quota as a backstop (`mc quota set --size 30GiB`).
   Per-upload cap: 4 GB. A per-club quota exists in the model and defaults to the global cap.
4. **Disk/capacity monitoring**: a cron job (RowLens-owned) checks root-disk use and RowLens media use, and
   e-mails an alert at **75 % disk or 80 % of the media cap**. **Uploads pause when the root disk reaches
   85 %**, whoever is using the space, with a clear message in the UI. Usage is exported as a metric.
5. **Database backups**: nightly `pg_dump -Fc`, gpg-encrypted (same pattern as trustable's
   `backup-db.sh`), 30 daily + 12 monthly retained. A weekly automated **restore test** restores the latest
   dump into a throwaway Postgres container and runs a row-count/sanity query; failure alerts. The
   off-server copy needs a destination (Storage Box or a small bucket), decided in #37. Until then, backups
   stay local, like trustable's.
6. **Video backups: none during the pilot.** If the server or its disk is lost, all videos are lost; the
   database (sessions, messages, annotations) survives through its backups. The privacy statement and the
   coach onboarding text say this plainly. Revisit before the media cap is raised or a second club joins.

## Consequences

- No extra cost. The 30 GB cap means coaches will need to delete old clips during the pilot; the UI shows
  usage against the cap.
- The media volume shares the root disk: the cap and the 85 % pause protect trustable.nl and AudioScribe.
- Video playback goes through the app (authorised range streaming from MinIO, ADR-0007).
- Deletion is a job (DB row + all keys under the video prefix), audited.

## Revisit when

The cap is reached regularly, a second club onboards, or analysis artefacts (M2) need space. The
preferred next step is still Hetzner Object Storage with originals replicated to a second location.
