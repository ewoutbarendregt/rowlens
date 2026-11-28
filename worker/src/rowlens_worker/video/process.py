"""``video.process``: probe the upload, write the playback renditions and poster, mark it ready."""

from __future__ import annotations

import json
import logging
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from typing import Any
from uuid import UUID

import psycopg

from ..config import Config
from ..db import in_club
from ..errors import PermanentError
from ..media import MediaStore, original_key, video_key
from ..queue import Job, renew
from .probe import Probe, parse_probe, run_ffprobe
from .transcode import poster_args, renditions_for, run_ffmpeg, transcode_args

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Context:
    conn: psycopg.Connection
    config: Config
    media: MediaStore
    stop: Event


def process_video(ctx: Context, job: Job) -> None:
    video_id = UUID(str(job.payload["videoId"]))
    conn, club = ctx.conn, job.club_id
    with in_club(conn, club):
        row = conn.execute("select status from video where id = %s", (video_id,)).fetchone()
        if row is None or row[0] not in ("uploaded", "processing"):
            log.info("nothing to do", extra={"video": str(video_id), "status": row and row[0]})
            return
        conn.execute(
            "update video set status = 'processing', processing_progress = 0, updated_at = now()"
            " where id = %s",
            (video_id,),
        )

    started = time.monotonic()
    src = ctx.media.path(original_key(club, video_id))
    probe = parse_probe(run_ffprobe(src))
    _store_metadata(conn, club, video_id, probe)

    base = video_key(club, video_id)
    work = ctx.media.path(f"{base}/work")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    try:
        outputs = [(r, work / r.name) for r in renditions_for(probe)]

        def progress(share: float) -> None:
            renew(conn, job, ctx.config.worker_id, ctx.config.lease_seconds)
            with in_club(conn, club):
                conn.execute(
                    "update video set processing_progress = %s where id = %s",
                    (min(int(share * 95), 95), video_id),
                )

        run_ffmpeg(
            transcode_args(src, outputs, probe, ctx.config.ffmpeg_threads),
            duration_s=probe.duration_s,
            on_progress=progress,
            stop=ctx.stop,
        )
        smallest = outputs[-1][1]
        run_ffmpeg(
            poster_args(smallest, work / "poster", min(1.0, probe.duration_s / 2)),
            duration_s=1,
            on_progress=lambda _: None,
            stop=ctx.stop,
        )
        renditions = [_describe(path, r.name, f"{base}/renditions/{r.name}") for r, path in outputs]
        final_dir = ctx.media.path(f"{base}/renditions")
        shutil.rmtree(final_dir, ignore_errors=True)
        final_dir.mkdir()
        for r, path in outputs:
            path.rename(final_dir / r.name)
        (work / "poster").replace(ctx.media.path(f"{base}/poster"))
    finally:
        shutil.rmtree(work, ignore_errors=True)

    total = (
        sum(int(r["bytes"]) for r in renditions) + ctx.media.path(f"{base}/poster").stat().st_size
    )
    with in_club(conn, club):
        updated = conn.execute(
            "update video set status = 'ready', status_reason = null, processing_progress = 100,"
            " renditions = %s, renditions_bytes = %s, updated_at = now() where id = %s",
            (json.dumps(renditions), total, video_id),
        ).rowcount
    if updated == 0:
        # Deleted while we worked: its row is gone, so its bytes must go too.
        ctx.media.remove(base)
    log.info(
        "video processed",
        extra={
            "video": str(video_id),
            "seconds": round(time.monotonic() - started, 1),
            "bytes": total,
        },
    )


def mark_failed(ctx: Context, job: Job, reason: str) -> None:
    video_id = UUID(str(job.payload["videoId"]))
    with in_club(ctx.conn, job.club_id):
        ctx.conn.execute(
            "update video set status = 'failed', status_reason = %s, processing_progress = null,"
            " updated_at = now() where id = %s and status in ('uploaded', 'processing')",
            (reason, video_id),
        )


def _store_metadata(conn: psycopg.Connection, club: UUID, video_id: UUID, p: Probe) -> None:
    with in_club(conn, club):
        conn.execute(
            "update video set fps_num = %s, fps_den = %s, width = %s, height = %s,"
            " duration_ms = %s, frame_count = %s, codec = %s, rotation = %s, vfr = %s,"
            " recorded_at = %s where id = %s",
            (
                p.fps.numerator, p.fps.denominator, p.width, p.height, round(p.duration_s * 1000),
                p.frame_count, p.codec, p.rotation, p.vfr, p.recorded_at, video_id,
            ),
        )  # fmt: skip


def _describe(path: Path, name: str, key: str) -> dict[str, Any]:
    probe = run_ffprobe(path)
    stream = next(s for s in probe["streams"] if s.get("codec_type") == "video")
    return {
        "name": name,
        "key": key,
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "bytes": path.stat().st_size,
        "contentType": "video/mp4",
    }


__all__ = ["Context", "PermanentError", "mark_failed", "process_video"]
