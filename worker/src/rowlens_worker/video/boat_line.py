"""``video.boat_line``: the waterline in every frame of a ready video (ADR-0018).

Reads the smallest playback rendition (frame indices are the renditions' frames, ADR-0007) through
ffmpeg at the detector's work size, follows the waterline from frame to frame (restarting from a
coach's boat line where there is one), and stores one entry per frame: ``[x0, y0, x1, y1,
confidence]`` in fractions of the picture (left end first), or ``null`` where nothing convincing was
found. Queued after processing and again whenever a coach changes a boat line.
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from threading import Event
from uuid import UUID

import numpy as np

from ..analysis.waterline import DETECTOR, Image, Line, Pair, detect, work_size
from ..db import in_club
from ..errors import PermanentError, StopRequestedError
from ..queue import Job, renew
from .process import Context
from .transcode import FFMPEG, NICE

log = logging.getLogger(__name__)

JOB_TYPE = "video.boat_line"


def frames_of(
    path: Path, size: tuple[int, int], stop: Event, every: float, tick: Callable[[], None]
) -> Iterator[Image]:
    """Decoded frames at ``size`` (BGR), one per rendition frame, at low priority."""
    w, h = size
    args = [
        NICE, "-n", "15", FFMPEG, "-nostdin", "-v", "error", "-i", str(path),
        "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1",
    ]  # fmt: skip
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # noqa: S603
    if proc.stdout is None:
        raise RuntimeError("ffmpeg has no stdout")
    size_bytes = w * h * 3
    last = time.monotonic()
    try:
        while True:
            if stop.is_set():
                raise StopRequestedError
            if time.monotonic() - last >= every:
                tick()
                last = time.monotonic()
            chunk = proc.stdout.read(size_bytes)
            if len(chunk) < size_bytes:
                break
            yield np.frombuffer(chunk, np.uint8).reshape(h, w, 3)
    finally:
        proc.kill()
        _, err = proc.communicate()
    if proc.returncode not in (0, -9) and err:
        raise RuntimeError(err.decode(errors="replace")[-1500:])


def encode(line: Line | None) -> list[float] | None:
    if line is None:
        return None
    return [
        round(line.a[0], 4), round(line.a[1], 4), round(line.b[0], 4), round(line.b[1], 4),
        round(line.confidence, 2),
    ]  # fmt: skip


def boat_line(ctx: Context, job: Job) -> None:
    video_id = UUID(str(job.payload["videoId"]))
    conn, club = ctx.conn, job.club_id
    with in_club(conn, club):
        row = conn.execute(
            "select status, renditions, frame_count from video where id = %s", (video_id,)
        ).fetchone()
        if row is None or row[0] != "ready" or not row[1]:
            log.info("nothing to do", extra={"video": str(video_id), "status": row and row[0]})
            return
        lines = conn.execute(
            "select frame, points from video_boat_line where video_id = %s", (video_id,)
        ).fetchall()
        conn.execute(
            "insert into video_auto_boat_line (club_id, video_id, status)"
            " values (%s, %s, 'running')"
            " on conflict (video_id) do update set status = 'running', updated_at = now()",
            (club, video_id),
        )
    renditions: list[dict[str, object]] = row[1]
    smallest = min(renditions, key=lambda r: int(str(r["width"])) * int(str(r["height"])))
    frame_count = int(row[2] or 0)
    size = work_size(int(str(smallest["width"])), int(str(smallest["height"])))
    seeds: dict[int, Pair] = {}
    for frame, points in lines:
        (ax, ay), (bx, by) = points
        seeds[int(frame)] = ((float(ax), float(ay)), (float(bx), float(by)))

    path = ctx.media.path(str(smallest["key"]))
    if not path.exists():
        raise PermanentError("rendition_missing")
    started = time.monotonic()
    found = detect(
        frames_of(
            path,
            size,
            ctx.stop,
            every=30.0,
            tick=lambda: renew(conn, job, ctx.config.worker_id, ctx.config.lease_seconds),
        ),
        seeds,
    )
    if frame_count > 0:
        found = (found + [None] * frame_count)[:frame_count]
    frames = [encode(line) for line in found]
    with in_club(conn, club):
        conn.execute(
            "update video_auto_boat_line set status = 'done', frames = %s, detector = %s,"
            " computed_at = now(), updated_at = now() where video_id = %s",
            (json.dumps(frames, separators=(",", ":")), DETECTOR, video_id),
        )
    log.info(
        "boat lines found",
        extra={
            "video": str(video_id),
            "frames": len(frames),
            "with_line": sum(f is not None for f in frames),
            "seconds": round(time.monotonic() - started, 1),
        },
    )


def mark_failed(ctx: Context, job: Job) -> None:
    video_id = UUID(str(job.payload["videoId"]))
    with in_club(ctx.conn, job.club_id):
        ctx.conn.execute(
            "update video_auto_boat_line set status = 'failed', updated_at = now()"
            " where video_id = %s",
            (video_id,),
        )
