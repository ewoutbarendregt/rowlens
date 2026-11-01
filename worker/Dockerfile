# syntax=docker/dockerfile:1
FROM python:3.12-slim
LABEL org.opencontainers.image.source="https://github.com/ewoutbarendregt/rowlens" \
      org.opencontainers.image.title="rowlens-worker"

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

RUN useradd -m -u 1000 worker
USER worker
ENV PATH="/app/.venv/bin:${PATH}"
# Placeholder until the job loop lands (M0 "worker skeleton"): verifies the image and ffmpeg.
CMD ["sh", "-c", "python -c 'import rowlens_worker' && ffmpeg -hide_banner -version | head -1"]
