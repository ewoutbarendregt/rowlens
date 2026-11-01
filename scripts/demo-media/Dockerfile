# ffmpeg with x264, libvpx and a font for burned-in frame numbers; used by generate.sh on machines
# without a suitable local ffmpeg (e.g. macOS). Local tooling only, never deployed.
FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
