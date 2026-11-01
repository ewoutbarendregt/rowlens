"""ffmpeg command lines and runner for the playback renditions (ADR-0007, #47)."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from threading import Event

from ..errors import StopRequestedError
from .probe import Probe

NICE = shutil.which("nice") or "/usr/bin/nice"
FFMPEG = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"


@dataclass(frozen=True)
class Rendition:
    name: str
    #: The shorter side is at most this (portrait and landscape alike); never upscaled.
    short_side: int
    crf: int


#: play-540 starts fast on slow networks; play-1080 for detail (player spike, ADR-0007).
RENDITIONS = (Rendition("play-1080", 1080, 21), Rendition("play-540", 540, 25))


def renditions_for(probe: Probe) -> list[Rendition]:
    """A larger rendition only if the source is bigger than the next one down: a 480p source gets
    play-540 alone, instead of an identical (never upscaled) play-1080 as well."""
    short = min(probe.width, probe.height)
    return [
        r
        for i, r in enumerate(RENDITIONS)
        if i == len(RENDITIONS) - 1 or short > RENDITIONS[i + 1].short_side
    ]


def gop(fps: Fraction) -> int:
    """Keyframe every ~0.25 s, so a backward step decodes at most ~15 frames (ADR-0007)."""
    return max(1, round(fps / 4))


def _scale(short_side: int) -> str:
    # ffmpeg auto-rotates first, so iw/ih are display sizes here. -2 keeps the aspect, even-sized.
    n = short_side
    return (
        f"scale=w='if(gte(iw,ih),-2,trunc(min({n},iw)/2)*2)'"
        f":h='if(gte(iw,ih),trunc(min({n},ih)/2)*2,-2)'"
    )


def transcode_args(
    src: Path, outputs: list[tuple[Rendition, Path]], probe: Probe, threads: int
) -> list[str]:
    """One decode, split into every rendition: H.264 High, constant rate at the nominal fps, closed
    GOPs of ~0.25 s without scene-cut keyframes, AAC, faststart. Metadata (phone GPS location,
    device names) is dropped from the renditions."""
    labels = [f"v{i}" for i in range(len(outputs))]
    split = f"[0:v]split={len(outputs)}" + "".join(f"[s{i}]" for i in range(len(outputs)))
    chains = [
        f"[s{i}]{_scale(r.short_side)},format=yuv420p[{labels[i]}]"
        for i, (r, _) in enumerate(outputs)
    ]
    rate = f"{probe.fps.numerator}/{probe.fps.denominator}"
    g = str(gop(probe.fps))
    args = [FFMPEG, "-hide_banner", "-nostdin", "-y", "-i", str(src)]
    args += ["-filter_complex", ";".join([split, *chains])]
    for i, (rendition, out) in enumerate(outputs):
        args += ["-map", f"[{labels[i]}]"]
        if probe.has_audio:
            args += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2"]
        args += [
            "-fps_mode", "cfr", "-r", rate,
            "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast",
            "-crf", str(rendition.crf), "-g", g, "-keyint_min", g, "-sc_threshold", "0",
            "-flags", "+cgop", "-threads", str(threads),
            "-map_metadata", "-1", "-map_chapters", "-1",
            "-movflags", "+faststart", "-f", "mp4", str(out),
        ]  # fmt: skip
    return [*args, "-progress", "pipe:1", "-nostats"]


def poster_args(src: Path, out: Path, at_s: float) -> list[str]:
    return [
        FFMPEG, "-hide_banner", "-nostdin", "-y", "-ss", f"{at_s:.3f}", "-i", str(src),
        "-frames:v", "1", "-q:v", "3", "-map_metadata", "-1",
        "-f", "image2", "-c:v", "mjpeg", str(out),
    ]  # fmt: skip


def run_ffmpeg(
    args: list[str],
    *,
    duration_s: float,
    on_progress: Callable[[float], None],
    stop: Event,
    every_s: float = 5.0,
) -> None:
    """Runs ffmpeg at low priority (the server is shared), reporting progress from 0 to 1 at
    most every ``every_s``. Raises ``StopRequestedError`` if ``stop`` is set, ``RuntimeError``
    if ffmpeg fails."""
    with tempfile.TemporaryFile() as stderr:
        proc = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
            [NICE, "-n", "10", *args], stdout=subprocess.PIPE, stderr=stderr, text=True
        )
        if proc.stdout is None:
            raise RuntimeError("ffmpeg has no stdout")
        last = 0.0
        for line in proc.stdout:
            if stop.is_set():
                proc.kill()
                proc.wait()
                raise StopRequestedError
            key, _, value = line.strip().partition("=")
            if key == "out_time_us" and value.isdigit() and time.monotonic() - last >= every_s:
                last = time.monotonic()
                on_progress(min(int(value) / 1e6 / duration_s, 1.0))
        if proc.wait() != 0:
            stderr.seek(0)
            raise RuntimeError(stderr.read().decode(errors="replace")[-1500:])
