# syntax=docker/dockerfile:1
FROM python:3.15-slim
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

# uid 1000 owns /opt/rowlens/media on the server (ADR-0006); /media pre-created so a named volume
# (edge stack) starts out writable.
RUN useradd -m -u 1000 worker && install -d -o worker -g worker /media
USER worker
ENV PATH="/app/.venv/bin:${PATH}" PYTHONUNBUFFERED=1
# Claims jobs from Postgres until SIGTERM (ADR-0008).
CMD ["python", "-m", "rowlens_worker"]
