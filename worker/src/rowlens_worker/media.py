"""Media keys → paths, mirroring apps/web/src/server/media/store.ts (ADR-0006)."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from uuid import UUID

_KEY = re.compile(r"^[a-z0-9]+(?:[/-][a-z0-9]+)*$")


class MediaStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def path(self, key: str) -> Path:
        if not _KEY.fullmatch(key):
            raise ValueError(f"invalid media key: {key!r}")
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError(f"media key escapes the root: {key!r}")
        return path

    def remove(self, key: str) -> None:
        shutil.rmtree(self.path(key), ignore_errors=True)


def video_key(club_id: UUID, video_id: UUID) -> str:
    return f"clubs/{club_id}/videos/{video_id}"


def original_key(club_id: UUID, video_id: UUID) -> str:
    return f"{video_key(club_id, video_id)}/original"
