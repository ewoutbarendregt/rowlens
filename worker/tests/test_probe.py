from fractions import Fraction
from typing import Any

import pytest

from rowlens_worker.errors import PermanentError
from rowlens_worker.video.probe import parse_probe


def video_stream(**overrides: Any) -> dict[str, Any]:
    stream: dict[str, Any] = {
        "codec_type": "video",
        "codec_name": "h264",
        "width": 1920,
        "height": 1080,
        "r_frame_rate": "60/1",
        "avg_frame_rate": "60/1",
    }
    stream.update(overrides)
    return stream


def data(*streams: dict[str, Any], duration: str = "120.5") -> dict[str, Any]:
    return {"streams": list(streams), "format": {"duration": duration}}


def test_landscape_60fps_with_audio() -> None:
    p = parse_probe(data(video_stream(), {"codec_type": "audio"}))
    assert (p.width, p.height, p.fps, p.vfr, p.has_audio) == (1920, 1080, Fraction(60), False, True)
    assert p.frame_count == 7230


def test_iphone_hevc_portrait_rotated_and_variable_rate() -> None:
    # iPhone: 3840x2160 stored landscape, -90° display matrix; 30000/1001 nominal,
    # average 29.5 (frames dropped in low light).
    p = parse_probe(
        data(
            video_stream(
                codec_name="hevc",
                width=3840,
                height=2160,
                r_frame_rate="30000/1001",
                avg_frame_rate="2950/100",
                side_data_list=[{"side_data_type": "Display Matrix", "rotation": -90}],
            )
        )
    )
    assert (p.width, p.height, p.rotation, p.codec) == (2160, 3840, 270, "hevc")
    assert p.fps == Fraction(30000, 1001)
    assert p.vfr is True


def test_android_container_base_rate_falls_back_to_snapped_average() -> None:
    # Some Android files report r_frame_rate 90000/1 (out of range) and an average near 29.97.
    p = parse_probe(data(video_stream(r_frame_rate="90000/1", avg_frame_rate="2997/100")))
    assert p.fps == Fraction(30000, 1001)


def test_r_frame_rate_far_from_average_uses_the_average() -> None:
    p = parse_probe(data(video_stream(r_frame_rate="120/1", avg_frame_rate="30/1")))
    assert p.fps == Fraction(30)


def test_slow_motion_keeps_its_rate() -> None:
    p = parse_probe(data(video_stream(r_frame_rate="240/1", avg_frame_rate="240/1")))
    assert p.fps == Fraction(240)


def test_legacy_rotate_tag() -> None:
    p = parse_probe(data(video_stream(tags={"rotate": "90"})))
    assert (p.width, p.height, p.rotation) == (1080, 1920, 90)


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        (data({"codec_type": "audio"}), "no_video_stream"),
        (data(video_stream(width=0)), "unreadable"),
        (data(video_stream(r_frame_rate="0/0", avg_frame_rate="0/0")), "unreadable"),
        (data(video_stream(), duration="0"), "unreadable"),
        (data(video_stream(), duration=str(31 * 60)), "too_long"),
    ],
)
def test_refusals(payload: dict[str, Any], reason: str) -> None:
    with pytest.raises(PermanentError) as err:
        parse_probe(payload)
    assert err.value.reason == reason


def test_bitrate_from_the_format_or_from_size_and_duration() -> None:
    with_rate = {"streams": [video_stream()], "format": {"duration": "84", "bit_rate": "760000"}}
    assert parse_probe(with_rate).bitrate == 760_000
    from_size = {"streams": [video_stream()], "format": {"duration": "80", "size": "8000000"}}
    assert parse_probe(from_size).bitrate == 800_000
    assert parse_probe(data(video_stream())).bitrate is None
