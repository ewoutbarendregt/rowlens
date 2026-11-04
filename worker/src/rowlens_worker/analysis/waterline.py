"""The boat line from the picture (ADR-0018): a rowing boat's waterline, per frame.

Classical image processing, no model and nothing leaves the server. Per frame, at a work size of
480 px on the long side:

1. **Hull mask.** A vertical top-hat keeps what is clearly lighter than the picture a little above
   and below it and unsaturated: a (white or pale) hull against the water and its crew. Large light
   areas (sky, fog, far water) and saturated ones (a red coach boat, green banks) drop out. Closed
   horizontally across oars, opened so specks vanish.
2. **The hull.** The connected region that is long and flat, in the water (not touching the top),
   with a crew: some columns much darker than the water below it (rowers, the dark
   inside of the boat) or strongly coloured; a wake streak or a white wall has just water or sky
   above it. Nearer the camera
   is lower in the picture, so the boat beats the bank behind it. While a line is being followed,
   the region must lie near it (a wall or building far away is not the boat).
3. **The waterline.** Per column of the region its lowest pixel; a robust line through them.
4. **The ends.** From the region's ends, walk the line outward while it still has hull above and
   water below (lighter above than below), to the real bow and stern tips. An end at the picture's
   edge means the boat runs out of the picture: the line then follows the visible waterline.

Which end is the bow is not known here; the web app takes it from a coach's line or the coach's
choice. Frames where nothing convincing is found have no line (``None``): the coach's lines apply
there.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import cv2
import numpy as np
import numpy.typing as npt

#: Bump when the detection changes, so stored lines can be told apart.
DETECTOR = "waterline-1"
#: Long side of the picture the detection works on.
WORK = 480
#: Below this a found line isn't kept.
MIN_CONFIDENCE = 0.3
#: After this many frames without a line, the last one no longer guides the search.
LOCK_FRAMES = 15

Image = npt.NDArray[np.uint8]
Floats = npt.NDArray[np.float64]
#: Two points (x, y) in fractions of the picture.
Pair = tuple[tuple[float, float], tuple[float, float]]


@dataclass(frozen=True)
class Line:
    """A waterline in fractions of the picture: ``a`` is the left end, ``b`` the right end."""

    a: tuple[float, float]
    b: tuple[float, float]
    confidence: float


def work_size(width: int, height: int) -> tuple[int, int]:
    """The (even) picture size the detection runs at, for a frame of ``width`` x ``height``."""
    k = WORK / max(width, height)
    return max(2, round(width * k / 2) * 2), max(2, round(height * k / 2) * 2)


def hull_mask(frame: Image) -> Image:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    v = cv2.GaussianBlur(hsv[:, :, 2], (3, 3), 0)
    s = hsv[:, :, 1]
    h = v.shape[0]
    tall = max(15, h // 12)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, tall))
    top = cv2.morphologyEx(v, cv2.MORPH_TOPHAT, kernel)
    light = (((top > 22) & (s < 70)).astype(np.uint8)) * 255
    closed = cv2.morphologyEx(
        light, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 3))
    )
    opened = cv2.morphologyEx(
        closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 3))
    )
    return np.asarray(opened, dtype=np.uint8)


def crewed(gray: Image, sat: Image, region: npt.NDArray[np.bool_], x: int, y: int) -> bool:
    """A crew sits on a hull: just above its bottom edge (up to a little above the region), some
    columns hold pixels much darker than the water below the hull (clothing, the boat's inside) or
    strongly coloured (hi-vis jackets, a red buoyancy aid). Above a wake streak or a white wall
    there is just water or sky."""
    h = gray.shape[0]
    bh, bw = region.shape
    below = gray[min(h - 1, y + bh) : min(h, y + bh + 10), x : x + bw]
    if below.size == 0:
        return False
    water = float(np.median(below))
    top = max(0, y - max(8, h // 20))
    rows = slice(top, y + max(1, bh - 3))
    band = gray[rows, x : x + bw].astype(np.float32)
    colour = sat[rows, x : x + bw]
    crew = (band < water - 30) | (colour > 110)
    return float(np.mean(crew.any(axis=0))) > 0.08


def robust_line(xs: Floats, ys: Floats, rng: np.random.Generator) -> tuple[float, float]:
    """Median of sampled pairwise slopes, then the median intercept (Theil-Sen, sampled)."""
    n = len(xs)
    i = rng.integers(0, n, 400)
    j = rng.integers(0, n, 400)
    keep = np.abs(xs[i] - xs[j]) > 5
    slopes = (ys[j][keep] - ys[i][keep]) / (xs[j][keep] - xs[i][keep])
    m = float(np.median(slopes)) if len(slopes) else 0.0
    return m, float(np.median(ys - m * xs))


def extend(gray: Image, m: float, c: float, x0: float, x1: float) -> tuple[float, float]:
    h, w = gray.shape
    g = gray.astype(np.float32)

    def edge(x: int) -> bool:
        y = m * x + c
        best = 0.0
        for off in (-1, 0, 1, 2):  # the tips rise a little
            yy = round(y) - off
            if yy - 4 < 0 or yy + 3 >= h:
                return False
            above = float(np.mean(g[yy - 4 : yy - 1, x]))
            below = float(np.mean(g[yy + 1 : yy + 3, x]))
            best = max(best, above - below)
        return best > 10

    ends: list[float] = []
    for start, step in ((int(x0), -1), (int(x1), 1)):
        x, last, misses = start, start, 0
        while 0 <= x + step < w and misses < 4:
            x += step
            if edge(x):
                last, misses = x, 0
            else:
                misses += 1
        ends.append(float(last))
    return ends[0], ends[1]


class Tracker:
    """Finds the waterline frame by frame, following it from one frame to the next."""

    def __init__(self) -> None:
        # m, c, x0, x1 at work scale.
        self.prev: tuple[float, float, float, float] | None = None
        self.miss = 0
        self.rng = np.random.default_rng(1)

    def seed(self, line: Pair, size: tuple[int, int]) -> None:
        """Starts following from a line a coach set (fractions of the picture, either order)."""
        w, h = size
        (ax, ay), (bx, by) = sorted(line)
        ax, bx, ay, by = ax * w, bx * w, ay * h, by * h
        if abs(bx - ax) < 1:
            return
        m = (by - ay) / (bx - ax)
        self.prev = (m, ay - m * ax, ax, bx)
        self.miss = 0

    def step(self, small: Image) -> Line | None:
        h, w = small.shape[:2]
        gray = np.asarray(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), dtype=np.uint8)
        sat = np.asarray(cv2.cvtColor(small, cv2.COLOR_BGR2HSV)[:, :, 1], dtype=np.uint8)
        mask = hull_mask(small)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        locked = self.prev is not None and self.miss < LOCK_FRAMES
        best, best_score = -1, 0.0
        for i in range(1, n):
            x, y, bw, bh, area = (int(v) for v in stats[i])
            if bw < w * 0.12 or y <= 1 or y + bh > h * 0.97 or bw / max(1, bh) < 3:
                continue
            if locked and self.prev is not None:
                pm, pc, _, _ = self.prev
                dist = abs(y + bh - (pm * (x + bw / 2) + pc))
                if dist > max(25.0, h * 0.08):
                    continue
                near = 1.0 / (1.0 + dist / 15.0)
            else:
                near = 1.0
            if not crewed(gray, sat, labels[y : y + bh, x : x + bw] == i, x, y):
                continue
            fill = area / (bw * bh)
            score = bw * min(1.0, fill * 2.5) * (0.4 + (y + bh) / h) * near
            if score > best_score:
                best, best_score = i, score
        if best < 0:
            self.miss += 1
            return None
        x, y, bw, bh, _ = (int(v) for v in stats[best])
        region = labels[y : y + bh, x : x + bw] == best
        cols = np.nonzero(region.any(axis=0))[0]
        bottom = bh - 1 - np.argmax(region[::-1, :][:, cols], axis=0)
        xs = (cols + x).astype(np.float64)
        ys = (bottom + y + 1).astype(np.float64)
        m, c = robust_line(xs, ys, self.rng)
        if abs(m) > np.tan(np.radians(25)):
            self.miss += 1
            return None
        fit_share = float(np.mean(np.abs(ys - (m * xs + c)) < 3))
        x0, x1 = extend(gray, m, c, float(xs.min()), float(xs.max()))
        confidence = fit_share * min(1.0, (x1 - x0) / (w * 0.35))
        if confidence < MIN_CONFIDENCE:
            self.miss += 1
            return None
        if self.prev is not None and self.miss == 0:
            pm, pc, px0, px1 = self.prev
            m, c = 0.5 * m + 0.5 * pm, 0.5 * c + 0.5 * pc
            x0, x1 = 0.5 * x0 + 0.5 * px0, 0.5 * x1 + 0.5 * px1
        self.prev = (m, c, x0, x1)
        self.miss = 0
        return Line(
            a=(x0 / w, (m * x0 + c) / h),
            b=(x1 / w, (m * x1 + c) / h),
            confidence=confidence,
        )


def detect(
    frames: Iterable[Image],
    seeds: Mapping[int, Pair] | None = None,
) -> list[Line | None]:
    """Lines for a sequence of work-size frames; a coach's line at a frame restarts the following
    from it (``seeds``, by frame index)."""
    tracker = Tracker()
    out: list[Line | None] = []
    for index, frame in enumerate(frames):
        if seeds and index in seeds:
            tracker.seed(seeds[index], (frame.shape[1], frame.shape[0]))
        out.append(tracker.step(frame))
    return out
