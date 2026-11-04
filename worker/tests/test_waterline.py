"""The waterline detector (ADR-0018) on drawn pictures: grey water, light sky, a white hull with a
dark crew on it, its bottom edge on a known line."""

import cv2
import numpy as np
import pytest

from rowlens_worker.analysis.waterline import Line, Tracker, detect, work_size

W, H = 480, 270


def picture(
    x0: int,
    x1: int,
    y_left: float,
    y_right: float,
    *,
    crew: bool = True,
    hull_height: int = 12,
    seed: int = 0,
) -> np.ndarray:
    """A hull whose bottom edge runs from (x0, y_left) to (x1, y_right), at work size."""
    rng = np.random.default_rng(seed)
    img = np.full((H, W, 3), (95, 105, 100), np.uint8)  # greyish-green water (BGR)
    img[:90] = (185, 185, 185)  # foggy sky
    noise = rng.integers(-6, 7, img.shape)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    slope = (y_right - y_left) / (x1 - x0)
    for x in range(max(0, x0), min(W, x1 + 1)):
        bottom = round(y_left + slope * (x - x0))
        img[bottom - hull_height : bottom, x] = (235, 235, 235)
    if crew:
        for k in range(5):
            cx = x0 + (k + 1) * (x1 - x0) // 6
            base = round(y_left + slope * (cx - x0)) - hull_height
            cv2.rectangle(img, (cx - 6, base - 22), (cx + 6, base + 2), (30, 30, 40), -1)
    return img


def y_at(line: Line, x: float) -> float:
    (ax, ay), (bx, by) = line.a, line.b
    return ay + (by - ay) * (x - ax) / (bx - ax)


def test_work_size_keeps_the_shape_with_480_on_the_long_side() -> None:
    assert work_size(960, 540) == (480, 270)
    assert work_size(540, 960) == (270, 480)
    assert work_size(1920, 1080) == (480, 270)


def test_finds_the_bottom_of_the_hull_from_bow_to_stern() -> None:
    line = Tracker().step(picture(100, 380, 180, 194))
    assert line is not None
    # Ends at the hull's tips, on its bottom edge (fractions of the picture; 1 px is 0.002-0.004).
    assert line.a[0] * W == pytest.approx(100, abs=8)
    assert line.b[0] * W == pytest.approx(380, abs=8)
    assert y_at(line, 100 / W) * H == pytest.approx(180, abs=3)
    assert y_at(line, 380 / W) * H == pytest.approx(194, abs=3)
    assert line.confidence > 0.6


def test_a_boat_running_out_of_the_picture_follows_the_visible_waterline() -> None:
    line = Tracker().step(picture(-60, W + 60, 200, 186))
    assert line is not None
    assert line.a[0] < 0.02
    assert line.b[0] > 0.98
    assert y_at(line, 0.5) * H == pytest.approx(193, abs=3)


def test_a_light_streak_without_a_crew_is_not_a_boat() -> None:
    # A wake or a white wall: as long and light as a hull, but nobody on it.
    assert Tracker().step(picture(100, 380, 180, 185, crew=False)) is None


def test_while_following_a_line_a_far_away_candidate_is_refused() -> None:
    tracker = Tracker()
    assert tracker.step(picture(100, 380, 180, 182)) is not None
    # The next frame shows only something light much higher up (a bank, a building).
    assert tracker.step(picture(100, 380, 120, 122, seed=1)) is None


def test_a_coachs_line_restarts_the_following_from_it() -> None:
    near = picture(100, 380, 180, 182)
    far = picture(100, 380, 230, 232, seed=2)
    # Followed from the first frame, the second frame's boat is too far away…
    assert detect([near, far])[1] is None
    # …but a coach's line at that frame tells where to look.
    seeded = detect([near, far], {1: ((0.2, 231 / H), (0.8, 231 / H))})
    found = seeded[1]
    assert found is not None
    assert y_at(found, 0.5) * H == pytest.approx(231, abs=3)
