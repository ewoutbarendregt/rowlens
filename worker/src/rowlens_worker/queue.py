"""The Postgres job queue (ADR-0008), worker side."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg

from .db import in_club


@dataclass(frozen=True)
class Job:
    id: UUID
    club_id: UUID
    type: str
    payload: dict[str, Any]
    attempts: int


def backoff_seconds(attempt: int) -> int:
    """30 s, 2 min, 8 min, … capped at an hour."""
    return int(min(30 * 4 ** max(attempt - 1, 0), 3600))


def claim(conn: psycopg.Connection, worker_id: str, types: list[str], lease: int) -> Job | None:
    row = conn.execute(
        "select id, club_id, type, payload, attempts from rowlens_claim_job(%s, %s, %s)",
        (worker_id, types, lease),
    ).fetchone()
    if row is None:
        return None
    return Job(id=row[0], club_id=row[1], type=row[2], payload=row[3], attempts=row[4])


def renew(conn: psycopg.Connection, job: Job, worker_id: str, lease: int) -> None:
    with in_club(conn, job.club_id):
        conn.execute(
            "update job set locked_until = now() + make_interval(secs => %s)"
            " where id = %s and locked_by = %s",
            (lease, job.id, worker_id),
        )


def succeed(conn: psycopg.Connection, job: Job) -> None:
    with in_club(conn, job.club_id):
        conn.execute(
            "update job set status = 'succeeded', finished_at = now(), locked_by = null,"
            " locked_until = null, last_error = null where id = %s",
            (job.id,),
        )


def fail(conn: psycopg.Connection, job: Job, error: str, *, permanent: bool) -> bool:
    """Queues a retry with backoff, or marks the job dead. Returns True if it is dead."""
    with in_club(conn, job.club_id):
        row = conn.execute(
            "update job set"
            "  status = case when %s or attempts >= max_attempts"
            "    then 'dead'::job_status else 'queued'::job_status end,"
            "  finished_at = case when %s or attempts >= max_attempts then now() end,"
            "  run_after = now() + make_interval(secs => %s),"
            "  last_error = left(%s, 2000), locked_by = null, locked_until = null"
            " where id = %s returning status",
            (permanent, permanent, backoff_seconds(job.attempts), error, job.id),
        ).fetchone()
    return row is not None and row[0] == "dead"


def release(conn: psycopg.Connection, job: Job) -> None:
    """Back to the queue at once, without counting the attempt (the worker is stopping)."""
    with in_club(conn, job.club_id):
        conn.execute(
            "update job set status = 'queued', attempts = greatest(attempts - 1, 0),"
            " locked_by = null, locked_until = null where id = %s",
            (job.id,),
        )
