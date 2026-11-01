#!/usr/bin/env bash
# Generates clips for the player demo (#51) into apps/web/public/demo-media/ (gitignored).
#
#   pnpm demo:media                    # synthetic 60 and 30 fps clips, three rendition variants each
#   pnpm demo:media my-clip.mov ...    # also your own clips, transcoded with the same settings
#   pnpm demo:media --e2e              # only the small WebM fixture the Playwright test uses
#
# Every synthetic frame shows its frame number, so frame stepping can be checked by eye. Variants
# mirror ADR-0007: H.264 MP4 at constant source frame rate with a closed GOP of 0.25 s or 0.5 s, and
# an all-intra 540p rendition. ffmpeg runs in Docker (scripts/demo-media/Dockerfile) unless
# ROWLENS_MEDIA_LOCAL_FFMPEG=1 (CI, Linux with ffmpeg + fonts-dejavu-core installed).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$REPO/apps/web/public/demo-media"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
E2E_ONLY=0
CLIPS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --e2e) E2E_ONLY=1 ;;
    --out) OUT="$2"; shift ;;
    -*) echo "unknown option: $1" >&2; exit 64 ;;
    *) CLIPS+=("$1") ;;
  esac
  shift
done

# Re-run inside the tools image unless told to use the local ffmpeg.
if [[ "${ROWLENS_MEDIA_LOCAL_FFMPEG:-0}" != 1 ]]; then
  docker build -q -t rowlens-media-tools "$HERE" >/dev/null
  mkdir -p "$OUT"
  mounts=(-v "$HERE:/scripts:ro" -v "$OUT:/out")
  inner=(--out /out)
  ((E2E_ONLY)) && inner+=(--e2e)
  i=0
  for clip in ${CLIPS[@]+"${CLIPS[@]}"}; do
    [[ -f "$clip" ]] || { echo "no such file: $clip" >&2; exit 66; }
    dir="$(cd "$(dirname "$clip")" && pwd)"
    mounts+=(-v "$dir:/in/$i:ro")
    inner+=("/in/$i/$(basename "$clip")")
    i=$((i + 1))
  done
  exec docker run --rm --user "$(id -u):$(id -g)" -e ROWLENS_MEDIA_LOCAL_FFMPEG=1 "${mounts[@]}" \
    rowlens-media-tools bash /scripts/generate.sh "${inner[@]}"
fi

ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

mkdir -p "$OUT"
rm -f "$OUT"/*.mp4 "$OUT"/*.webm "$OUT"/manifest.json
entries=()

# add_entry <id> <label> <file> <fps> <gop> <height>
add_entry() {
  entries+=("$(printf '{"id":"%s","label":"%s","src":"%s","fps":%s,"gop":"%s","height":%s}' "$@")")
}

# x264 settings shared by all MP4 variants (ADR-0007): CFR, closed GOP, no scene-cut keyframes.
# encode <input args...> -- <fps> <gop frames|intra> <height> <out file> [extra -vf filters]
encode() {
  local -a input=()
  while [[ "$1" != -- ]]; do input+=("$1"); shift; done
  shift
  local fps="$1" gop="$2" height="$3" out="$4" pre="${5:-}"
  local g
  if [[ "$gop" == intra ]]; then g=1; else g="$gop"; fi
  local vf="scale=-2:${height}:flags=lanczos"
  [[ -n "$pre" ]] && vf="$pre,$vf"
  ff "${input[@]}" -vf "$vf" -an \
    -c:v libx264 -profile:v high -preset medium -crf 20 -pix_fmt yuv420p \
    -g "$g" -keyint_min "$g" -sc_threshold 0 -flags +cgop \
    -fps_mode cfr -r "$fps" -movflags +faststart "$OUT/$out"
}

label_filter() {
  local fps="$1"
  printf '%s' "drawbox=x='mod(t*${fps}*24\,iw)':y=ih*0.72:w=48:h=ih*0.2:color=white@0.9:t=fill," \
    "drawtext=fontfile=$FONT:text='frame %{eif\:n\:d\:4}':fontsize=h/8:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=24:x=(w-tw)/2:y=h*0.08," \
    "drawtext=fontfile=$FONT:text='%{pts\:hms}  ${fps} fps':fontsize=h/20:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=12:x=(w-tw)/2:y=h*0.3"
}

synthetic() {
  local fps="$1" name="synthetic-${1}fps"
  local src=(-f lavfi -i "testsrc2=size=1920x1080:rate=${fps}:duration=10")
  local quarter=$(((fps + 2) / 4)) half=$(((fps + 1) / 2))
  echo "· $name"
  encode "${src[@]}" -- "$fps" "$quarter" 1080 "$name-gop025.mp4" "$(label_filter "$fps")"
  add_entry "$name-gop025" "Synthetic ${fps} fps · GOP 0.25 s · 1080p" "$name-gop025.mp4" "$fps" "$quarter" 1080
  encode "${src[@]}" -- "$fps" "$half" 1080 "$name-gop050.mp4" "$(label_filter "$fps")"
  add_entry "$name-gop050" "Synthetic ${fps} fps · GOP 0.5 s · 1080p" "$name-gop050.mp4" "$fps" "$half" 1080
  encode "${src[@]}" -- "$fps" intra 540 "$name-intra540.mp4" "$(label_filter "$fps")"
  add_entry "$name-intra540" "Synthetic ${fps} fps · all-intra · 540p" "$name-intra540.mp4" "$fps" intra 540
}

e2e_fixture() {
  echo "· e2e-30fps"
  ff -f lavfi -i "testsrc2=size=640x360:rate=30:duration=4" -vf "$(label_filter 30)" -an \
    -c:v libvpx-vp9 -b:v 0 -crf 40 -g 8 -deadline realtime -cpu-used 8 -pix_fmt yuv420p "$OUT/e2e-30fps.webm"
  add_entry "e2e-30fps" "Test fixture · 30 fps · VP9" "e2e-30fps.webm" 30 8 360
}

own_clip() {
  local path="$1" base id rate fps height src_h quarter
  base="$(basename "${path%.*}")"
  id="clip-$(printf '%s' "$base" | tr -c 'A-Za-z0-9._-' '-')"
  rate="$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$path")"
  src_h="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$path")"
  fps="$(awk -F/ '{ printf "%.3f", ($2 ? $1 / $2 : $1) }' <<<"$rate")"
  height=$((src_h < 1080 ? src_h : 1080))
  quarter="$(awk -v f="$fps" 'BEGIN { g = int(f / 4 + 0.5); print (g < 1 ? 1 : g) }')"
  echo "· $id (${fps} fps, ${src_h}p)"
  encode -i "$path" -- "$rate" "$quarter" "$height" "$id-gop025.mp4"
  add_entry "$id-gop025" "$base · GOP 0.25 s · ${height}p" "$id-gop025.mp4" "$fps" "$quarter" "$height"
  encode -i "$path" -- "$rate" intra 540 "$id-intra540.mp4"
  add_entry "$id-intra540" "$base · all-intra · 540p" "$id-intra540.mp4" "$fps" intra 540
}

if ((E2E_ONLY)); then
  e2e_fixture
else
  for clip in ${CLIPS[@]+"${CLIPS[@]}"}; do own_clip "$clip"; done
  synthetic 60
  synthetic 30
  e2e_fixture
fi

{
  printf '[\n'
  for i in "${!entries[@]}"; do
    printf '  %s%s\n' "${entries[$i]}" "$([[ $i -lt $((${#entries[@]} - 1)) ]] && echo ,)"
  done
  printf ']\n'
} >"$OUT/manifest.json"
echo "wrote ${#entries[@]} clips to $OUT"
