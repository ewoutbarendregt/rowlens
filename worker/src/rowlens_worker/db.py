"""Database access as rowlens_app: every read or write about a club runs inside ``in_club``."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

import psycopg


def connect(url: str) -> psycopg.Connection:
    # Autocommit: transactions are explicit (in_club), and LISTEN works between them.
    return psycopg.connect(url, autocommit=True, application_name="rowlens-worker")


@contextmanager
def in_club(conn: psycopg.Connection, club_id: UUID) -> Iterator[psycopg.Connection]:
    """A transaction in one club: RLS sees ``app.club_id`` (ADR-0005), reset at commit/rollback."""
    with conn.transaction():
        conn.execute(
            "select set_config('app.club_id', %s, true), set_config('app.user_id', '', true)",
            (str(club_id),),
        )
        yield conn
