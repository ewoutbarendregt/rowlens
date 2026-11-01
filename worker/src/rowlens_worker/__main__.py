"""``python -m rowlens_worker``: claim jobs from Postgres and run them until stopped (ADR-0008).

``--once`` handles what is queued now and exits (tests, manual runs).
"""

from __future__ import annotations

import json
import logging
import signal
import sys
from collections.abc import Callable
from threading import Event
from types import FrameType

from .config import Config
from .db import connect
from .errors import PermanentError, StopRequestedError
from .media import MediaStore
from .queue import Job, claim, fail, release, succeed
from .video.process import Context, mark_failed, process_video

HANDLERS: dict[str, Callable[[Context, Job], None]] = {"video.process": process_video}

log = logging.getLogger("rowlens_worker")


class JsonFormatter(logging.Formatter):
    _SKIP = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message"}

    def format(self, record: logging.LogRecord) -> str:
        line = {
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "logger": record.name,
        }
        line.update({k: v for k, v in record.__dict__.items() if k not in self._SKIP})
        if record.exc_info:
            line["error"] = self.formatException(record.exc_info)
        return json.dumps(line, default=str)


def run_job(ctx: Context, job: Job) -> None:
    handler = HANDLERS.get(job.type)
    fields = {"job": str(job.id), "type": job.type, "attempt": job.attempts}
    try:
        if handler is None:
            raise PermanentError("unknown_job_type")
        handler(ctx, job)
    except StopRequestedError:
        release(ctx.conn, job)
        log.info("job released: shutting down", extra=fields)
        return
    except PermanentError as err:
        fail(ctx.conn, job, str(err), permanent=True)
        if job.type == "video.process":
            mark_failed(ctx, job, err.reason)
        log.warning("job failed permanently", extra={**fields, "reason": err.reason})
        return
    except Exception as err:
        dead = fail(ctx.conn, job, f"{type(err).__name__}: {err}", permanent=False)
        if dead and job.type == "video.process":
            mark_failed(ctx, job, "processing_failed")
        log.exception("job failed", extra={**fields, "dead": dead})
        return
    succeed(ctx.conn, job)
    log.info("job done", extra=fields)


def main(argv: list[str]) -> int:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler])
    config = Config.from_env()
    stop = Event()

    def on_signal(signum: int, _frame: FrameType | None) -> None:
        log.info("stopping", extra={"signal": signum})
        stop.set()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    conn = connect(config.database_url)
    conn.execute("listen rowlens_jobs")
    ctx = Context(conn=conn, config=config, media=MediaStore(config.media_dir), stop=stop)
    log.info("worker ready", extra={"worker": config.worker_id, "types": sorted(HANDLERS)})
    while not stop.is_set():
        job = claim(conn, config.worker_id, sorted(HANDLERS), config.lease_seconds)
        if job is not None:
            run_job(ctx, job)
            continue
        if "--once" in argv:
            break
        # Sleep until a new job is announced or the poll interval passes.
        for _ in conn.notifies(timeout=config.poll_seconds, stop_after=1):
            pass
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
