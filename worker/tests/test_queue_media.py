from pathlib import Path
from uuid import UUID

import pytest

from rowlens_worker.media import MediaStore, original_key, video_key
from rowlens_worker.queue import backoff_seconds

CLUB = UUID("7c1e1f8a-0000-4000-8000-000000000001")
VIDEO = UUID("7c1e1f8a-0000-4000-8000-000000000002")


def test_backoff_grows_and_is_capped() -> None:
    assert [backoff_seconds(n) for n in (1, 2, 3, 4, 10)] == [30, 120, 480, 1920, 3600]


def test_keys_match_the_web_app(tmp_path: Path) -> None:
    store = MediaStore(tmp_path)
    assert original_key(CLUB, VIDEO) == f"clubs/{CLUB}/videos/{VIDEO}/original"
    assert store.path(video_key(CLUB, VIDEO)) == tmp_path.resolve() / "clubs" / str(
        CLUB
    ) / "videos" / str(VIDEO)


@pytest.mark.parametrize("key", ["../etc", "clubs/../../x", "/abs", "Clubs/A", "a//b", "", "a.b"])
def test_rejects_unsafe_keys(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValueError, match="invalid media key"):
        MediaStore(tmp_path).path(key)
