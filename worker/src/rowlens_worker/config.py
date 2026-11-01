"""Worker settings from the environment (the same names as the web app where they overlap)."""

from __future__ import annotations

import os
import socket
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    #: Connection as ``rowlens_app`` (no BYPASSRLS), like the web app (ADR-0005).
    database_url: str
    #: Same directory the web app writes uploads to (ADR-0006).
    media_dir: Path
    worker_id: str
    #: A job not renewed for this long is taken over by another worker.
    lease_seconds: int = 600
    poll_seconds: float = 5.0
    #: ffmpeg threads; the container is CPU-limited too (shared server).
    ffmpeg_threads: int = 2

    @staticmethod
    def from_env(env: Mapping[str, str] = os.environ) -> Config:
        missing = [k for k in ("DATABASE_URL", "MEDIA_DIR") if not env.get(k)]
        if missing:
            raise SystemExit(f"missing environment: {', '.join(missing)}")
        return Config(
            database_url=env["DATABASE_URL"],
            media_dir=Path(env["MEDIA_DIR"]),
            worker_id=env.get("WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}",
            lease_seconds=int(env.get("JOB_LEASE_SECONDS", "600")),
            poll_seconds=float(env.get("JOB_POLL_SECONDS", "5")),
            ffmpeg_threads=int(env.get("FFMPEG_THREADS", "2")),
        )
