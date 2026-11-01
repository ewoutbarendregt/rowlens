"""ffprobe → the facts playback and analysis rely on (#47)."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

from ..errors import PermanentError

FFPROBE = shutil.which("ffprobe") or "/usr/bin/ffprobe"
MAX_DURATION_S = 30 * 60
MAX_FPS = 240

# Nominal rates cameras and phones record at; a measured average snaps to the nearest (within 1 %).
_COMMON_RATES = [
    Fraction(24000, 1001), Fraction(24), Fraction(25), Fraction(30000, 1001), Fraction(30),
    Fraction(48), Fraction(50), Fraction(60000, 1001), Fraction(60), Fraction(90), Fraction(100),
    Fraction(120000, 1001), Fraction(120), Fraction(240),
]  # fmt: skip


@dataclass(frozen=True)
class Probe:
    #: Display size: after rotation, as the renditions will be.
    width: int
    height: int
    #: Nominal frame rate; the renditions are constant-rate at exactly this (ADR-0007).
    fps: Fraction
    duration_s: float
    codec: str
    rotation: int
    #: Heuristic: the source's average rate is >0.5 % off its nominal rate (phones drop frames in
    #: low light). The renditions are constant-rate either way.
    vfr: bool
    has_audio: bool
    #: Whole-file bitrate (bit/s) if known; caps the renditions' bitrate (#47).
    bitrate: int | None = None

    @property
    def frame_count(self) -> int:
        return round(self.duration_s * self.fps)


def run_ffprobe(path: Path) -> dict[str, Any]:
    out = subprocess.run(  # noqa: S603 - fixed argv, no shell
        [FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        capture_output=True,
        check=False,
        timeout=120,
    )
    if out.returncode != 0:
        raise PermanentError("unreadable", out.stderr.decode(errors="replace")[-500:])
    data: dict[str, Any] = json.loads(out.stdout)
    return data


def _rate(value: object) -> Fraction | None:
    if not isinstance(value, str) or "/" not in value:
        return None
    num, den = value.split("/", 1)
    try:
        rate = Fraction(int(num), int(den))
    except (ValueError, ZeroDivisionError):
        return None
    return rate if 0 < rate <= MAX_FPS else None


def _snap(rate: Fraction) -> Fraction:
    nearest = min(_COMMON_RATES, key=lambda c: abs(c - rate))
    return nearest if abs(nearest - rate) / nearest <= Fraction(1, 100) else rate


def _is_common(rate: Fraction | None) -> bool:
    return rate is not None and _snap(rate) in _COMMON_RATES


def _nominal(r: Fraction | None, avg: Fraction | None, measured: Fraction) -> Fraction:
    """The rate the camera meant to record at.

    1. The average, if it is a common rate: it is what the frames really amount to. A phone clip
       on production had r_frame_rate 600/19 (31.58, its timestamp grid) but an average of 29.99;
       choosing 31.58 duplicated ~5 % of the frames.
    2. r_frame_rate, if it is a common rate (phones dropping frames in low light average below it).
    3. Otherwise r_frame_rate unless it is far off the average (Android files report 90000/1),
       else the average.
    """
    if _is_common(avg) and avg is not None:
        return _snap(avg)
    if _is_common(r) and r is not None:
        return _snap(r)
    if r is not None and (avg is None or abs(r - avg) / r <= Fraction(1, 5)):
        return r
    return measured


def _rotation(stream: dict[str, Any]) -> int:
    for side in stream.get("side_data_list", []):
        if "rotation" in side:
            return round(float(side["rotation"])) % 360
    tag = stream.get("tags", {}).get("rotate")
    return int(tag) % 360 if tag is not None else 0


def parse_probe(data: dict[str, Any]) -> Probe:
    streams: list[dict[str, Any]] = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise PermanentError("no_video_stream")
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    if width <= 0 or height <= 0:
        raise PermanentError("unreadable", "no picture size")

    r = _rate(video.get("r_frame_rate"))
    avg = _rate(video.get("avg_frame_rate"))
    measured = avg or r
    if measured is None:
        raise PermanentError("unreadable", "no frame rate")
    fps = _nominal(r, avg, measured)
    vfr = avg is not None and abs(fps - avg) / fps > Fraction(1, 200)

    fmt: dict[str, Any] = data.get("format", {})
    duration = float(fmt.get("duration") or video.get("duration") or 0)
    if duration <= 0:
        raise PermanentError("unreadable", "no duration")
    if duration > MAX_DURATION_S:
        raise PermanentError("too_long")

    rotation = _rotation(video)
    if rotation in (90, 270):
        width, height = height, width
    return Probe(
        width=width,
        height=height,
        fps=fps,
        duration_s=duration,
        codec=str(video.get("codec_name", "unknown")),
        rotation=rotation,
        vfr=vfr,
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
        bitrate=_bitrate(fmt, duration),
    )


def _bitrate(fmt: dict[str, Any], duration: float) -> int | None:
    if str(fmt.get("bit_rate", "")).isdigit():
        return int(fmt["bit_rate"])
    if str(fmt.get("size", "")).isdigit() and duration > 0:
        return round(int(fmt["size"]) * 8 / duration)
    return None
