from fractions import Fraction
from pathlib import Path

from rowlens_worker.video.probe import Probe
from rowlens_worker.video.transcode import (
    RENDITIONS,
    gop,
    poster_args,
    renditions_for,
    transcode_args,
)

PROBE = Probe(
    width=2160,
    height=3840,
    fps=Fraction(60000, 1001),
    duration_s=10.0,
    codec="hevc",
    rotation=270,
    vfr=True,
    has_audio=True,
)


def option(args: list[str], name: str, nth: int = 0) -> str:
    idx = [i for i, a in enumerate(args) if a == name][nth]
    return args[idx + 1]


def test_gop_is_a_quarter_second() -> None:
    assert [gop(Fraction(f)) for f in (24, 25, 30, 60, 120, 240)] == [6, 6, 8, 15, 30, 60]
    assert gop(Fraction(60000, 1001)) == 15
    assert gop(Fraction(2)) == 1


def test_one_decode_split_into_both_renditions() -> None:
    outs = [(r, Path(f"/out/{r.name}")) for r in RENDITIONS]
    args = transcode_args(Path("/media/in"), outs, PROBE, threads=2)
    graph = option(args, "-filter_complex")
    assert graph.startswith("[0:v]split=2[s0][s1];")
    assert "min(1080,iw)" in graph and "min(540,iw)" in graph
    assert args.count("-i") == 1
    for i in range(2):
        # Constant rate at exactly the source's nominal rate; closed ~0.25 s GOPs; no scene cuts.
        assert option(args, "-fps_mode", i) == "cfr"
        assert option(args, "-r", i) == "60000/1001"
        assert option(args, "-g", i) == "15"
        assert option(args, "-keyint_min", i) == "15"
        assert option(args, "-sc_threshold", i) == "0"
        assert option(args, "-flags", i) == "+cgop"
        assert option(args, "-movflags", i) == "+faststart"
        # Phone metadata (GPS location, device) never reaches the renditions.
        assert option(args, "-map_metadata", i) == "-1"
    assert args[-3:] == ["-progress", "pipe:1", "-nostats"]
    assert args[args.index("-progress") - 1] == "/out/play-540"


def test_no_audio_map_without_audio() -> None:
    silent = Probe(**{**PROBE.__dict__, "has_audio": False})
    args = transcode_args(Path("/in"), [(RENDITIONS[0], Path("/out"))], silent, threads=2)
    assert "0:a:0" not in args


def test_poster_has_no_metadata() -> None:
    args = poster_args(Path("/in"), Path("/poster"), 1.0)
    assert option(args, "-ss") == "1.000"
    assert option(args, "-map_metadata") == "-1"
    assert args[-1] == "/poster"


def test_renditions_never_duplicate_a_small_source() -> None:
    def names(width: int, height: int) -> list[str]:
        return [
            r.name
            for r in renditions_for(Probe(**{**PROBE.__dict__, "width": width, "height": height}))
        ]

    assert names(3840, 2160) == ["play-1080", "play-540"]
    assert names(2160, 3840) == ["play-1080", "play-540"]
    assert names(1280, 720) == ["play-1080", "play-540"]  # play-1080 is then the 720p source size
    assert names(960, 540) == ["play-540"]
    assert names(640, 360) == ["play-540"]
