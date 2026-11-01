from fractions import Fraction
from pathlib import Path

from rowlens_worker.video.probe import Probe
from rowlens_worker.video.transcode import (
    RENDITIONS,
    gop,
    max_kbps,
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
    # Seen on production: a 1024x576 source got two near-identical renditions.
    assert names(1024, 576) == ["play-540"]
    assert names(576, 1024) == ["play-540"]
    assert names(960, 540) == ["play-540"]
    assert names(640, 360) == ["play-540"]


def probe(**changes: object) -> Probe:
    return Probe(**{**PROBE.__dict__, **changes})


def test_bitrate_ceiling_scales_with_frame_rate() -> None:
    p1080, p540 = RENDITIONS
    high = probe(fps=Fraction(30), bitrate=50_000_000)
    assert (max_kbps(p1080, high), max_kbps(p540, high)) == (8000, 2500)
    sixty = probe(fps=Fraction(60), bitrate=50_000_000)
    assert (max_kbps(p1080, sixty), max_kbps(p540, sixty)) == (11314, 3536)
    assert max_kbps(p540, probe(fps=Fraction(30), bitrate=None)) == 2500


def test_low_bitrate_sources_are_not_inflated() -> None:
    # The production clip: 8 MB over 84 s, ~0.76 Mbit/s.
    clip = probe(fps=Fraction(30000, 1001), bitrate=760_000)
    assert max_kbps(RENDITIONS[1], clip) == 1140
    # A quarter of the ceiling is the floor, so tiny sources stay watchable.
    assert max_kbps(RENDITIONS[1], probe(fps=Fraction(30), bitrate=100_000)) == 625


def test_maxrate_and_bufsize_in_the_command() -> None:
    clip = probe(fps=Fraction(30), bitrate=760_000, width=1024, height=576)
    args = transcode_args(Path("/in"), [(RENDITIONS[1], Path("/out"))], clip, threads=2)
    assert (option(args, "-maxrate"), option(args, "-bufsize")) == ("1140k", "2280k")
