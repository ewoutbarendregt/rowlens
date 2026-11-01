# ADR-0008: Postgres-backed job queue shared by Node and Python

- **Status**: accepted (implemented in #47, 2026-11-01)
- **Date**: 2026-11-01

## Context

The TypeScript web app enqueues work; the Python worker executes it (probe, transcode, delete, analysis,
notification digests). The worker must be movable to a GPU host later. We'd like to avoid running Redis
just for a queue at this scale.

## Decision

- A `job` table in the RowLens database: `id, club_id, type, payload jsonb, status
  (queued|running|succeeded|failed|dead), priority, attempts, max_attempts, run_after, locked_by,
  locked_until, last_error, created_at, finished_at, idempotency_key unique`.
- Claim with `UPDATE … WHERE id = (SELECT id … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`; lease via
  `locked_until`, renewed by heartbeat; expired leases are re-queued. Exponential backoff; `dead` after
  `max_attempts`, surfaced in an admin view and alert.
- `LISTEN/NOTIFY rowlens_jobs` to wake workers; polling every 5 s as a fallback.
- Job types and payload schemas are defined once (JSON Schema in `packages/contracts/jobs/`) and
  generated into TS (Zod) and Python (pydantic) types; CI checks they're in sync.
- Handlers are idempotent (re-running a transcode overwrites the same keys).
- Queues by resource class: `cpu` (probe, transcode, delete) and `gpu` (pose/analysis). A worker declares
  which classes it consumes, so a GPU host can take `gpu` only.

## Consequences

- No new infrastructure; transactional enqueue (job row written in the same transaction as the video row).
- If throughput ever outgrows Postgres (unlikely below thousands of jobs/min), swap the adapter behind the
  same interface for Redis/RabbitMQ.
- A remote GPU worker needs DB access over a private network/VPN, or a thin HTTP job API — decide at M2.

## Alternatives considered

- **Redis + Celery/RQ** — mature in Python, awkward to enqueue from Node, extra service. Rejected for now.
- **pg-boss** / **Procrastinate** — each is single-language; we'd have to reimplement the other side.

## Implementation notes (#47, 2026-11-01)

- Tenancy: RLS shows the worker (role `rowlens_app`) one club at a time, so claiming goes through
  `rowlens_claim_job(worker, types, lease)` (SECURITY DEFINER, pinned search_path). It also marks
  jobs whose lease expired on their last attempt as `dead`. Everything after the claim (renew,
  succeed, fail, the video updates) runs in the job's club via `set_config('app.club_id', …, true)`.
- Statuses: `queued | running | succeeded | dead` (no separate `failed`: a failed attempt goes back to
  `queued` with backoff 30 s × 4ⁿ⁻¹, max 1 h; out of attempts or a permanent error → `dead`).
- One job type so far, `video.process` (probe + transcode + poster in one job, idempotency key
  `video.process:<videoId>`), inserted in the same transaction that marks the upload complete.
- Job schemas: the payload is `{videoId}` only; the shared contracts package (#20) is still to do.
- Wake-up: an AFTER INSERT trigger does `pg_notify('rowlens_jobs', type)`; workers also poll (5 s).
- Shutdown: SIGTERM kills ffmpeg and puts the job back without counting the attempt.
