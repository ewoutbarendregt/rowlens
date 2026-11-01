"""Stroke rate and rhythm consistency from detected catch frames."""

from __future__ import annotations

import itertools
import statistics
from collections.abc import Sequence

from rowlens_worker.metrics.result import MetricResult, MetricStatus

DEFAULT_MIN_STROKES = 3
DEFAULT_MAX_PERIOD_CV = 0.25


def stroke_rate(
    catch_frames: Sequence[int],
    fps: float,
    *,
    min_strokes: int = DEFAULT_MIN_STROKES,
    max_period_cv: float = DEFAULT_MAX_PERIOD_CV,
) -> MetricResult:
    """Mean stroke rate in strokes per minute over consecutive catches.

    A stroke is the interval between two consecutive catches, so `n` catches give `n - 1` strokes.
    Refuses when there are fewer than `min_strokes` strokes, or when the stroke periods vary so much
    (coefficient of variation above `max_period_cv`) that a mean rate would be misleading, typically
    missed or spurious catch detections.
    """
    if fps <= 0:
        raise ValueError(f"fps must be positive, got {fps}")
    if any(b <= a for a, b in itertools.pairwise(catch_frames)):
        raise ValueError("catch_frames must be strictly increasing")

    params: dict[str, float | int | str] = {
        "fps": fps,
        "min_strokes": min_strokes,
        "max_period_cv": max_period_cv,
    }
    name, unit = "stroke_rate", "spm"
    periods = [(b - a) / fps for a, b in itertools.pairwise(catch_frames)]

    if len(periods) < min_strokes:
        return MetricResult.refused(
            name, unit, f"need at least {min_strokes} strokes, found {len(periods)}", params
        )

    cv = period_cv(periods)
    if cv > max_period_cv:
        return MetricResult.refused(
            name, unit, f"stroke periods too irregular (CV {cv:.2f} > {max_period_cv})", params
        )

    mean_period = statistics.fmean(periods)
    return MetricResult(
        name=name,
        unit=unit,
        status=MetricStatus.OK,
        value=60.0 / mean_period,
        confidence=max(0.0, 1.0 - cv / max_period_cv),
        evidence_frames=tuple(catch_frames),
        parameters=params,
    )


def period_cv(periods: Sequence[float]) -> float:
    """Coefficient of variation of stroke periods (0 = perfectly even rhythm)."""
    if len(periods) < 2:
        return 0.0
    return statistics.stdev(periods) / statistics.fmean(periods)
