import pytest

from rowlens_worker.metrics.result import MetricStatus
from rowlens_worker.metrics.stroke_rate import period_cv, stroke_rate


def test_even_rhythm_at_30_spm() -> None:
    # 60 fps, one catch every 2.0 s = 120 frames -> 30 strokes per minute
    catches = [0, 120, 240, 360, 480]
    result = stroke_rate(catches, fps=60)
    assert result.status is MetricStatus.OK
    assert result.value == pytest.approx(30.0)
    assert result.confidence == pytest.approx(1.0)
    assert result.evidence_frames == tuple(catches)
    assert result.parameters["fps"] == 60


def test_ntsc_frame_rate() -> None:
    fps = 60000 / 1001
    catches = [round(i * 2.0 * fps) for i in range(6)]
    result = stroke_rate(catches, fps=fps)
    assert result.value == pytest.approx(30.0, abs=0.05)


def test_refuses_with_too_few_strokes() -> None:
    result = stroke_rate([0, 120, 240], fps=60)
    assert result.status is MetricStatus.REFUSED
    assert result.value is None
    assert result.reason is not None and "at least 3 strokes" in result.reason


def test_refuses_when_a_catch_was_missed() -> None:
    # one catch missing -> one period is doubled -> irregular rhythm, so no mean rate
    result = stroke_rate([0, 120, 240, 480, 600], fps=60)
    assert result.status is MetricStatus.REFUSED
    assert result.reason is not None and "irregular" in result.reason


@pytest.mark.parametrize("frames", [[0, 120, 120, 240], [0, 240, 120, 360]])
def test_rejects_non_increasing_frames(frames: list[int]) -> None:
    with pytest.raises(ValueError, match="strictly increasing"):
        stroke_rate(frames, fps=60)


def test_rejects_non_positive_fps() -> None:
    with pytest.raises(ValueError, match="fps"):
        stroke_rate([0, 1, 2, 3], fps=0)


def test_period_cv() -> None:
    assert period_cv([2.0, 2.0, 2.0]) == 0.0
    assert period_cv([2.0]) == 0.0
    assert period_cv([1.0, 3.0]) == pytest.approx(0.7071, abs=1e-4)
