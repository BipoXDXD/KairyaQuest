# Contexto: raiz do projeto. scripts/docker-build.sh escolhe a plataforma de saída.
FROM ghcr.io/astral-sh/uv:0.12.15@sha256:62f8c047d0a0e9ece6b53fc63df902585a67a47a7f318ddec4a37db586edc8e3 AS uv
FROM python:3.14.8-slim-trixie@sha256:fbecd461fc72d21b2143c6eaba25143738079154a6d0ea3da3aec724f50eed4a AS build
COPY --from=uv /uv /bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY src/ src/
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-editable

FROM python:3.14.8-slim-trixie@sha256:fbecd461fc72d21b2143c6eaba25143738079154a6d0ea3da3aec724f50eed4a
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini ./
COPY alembic/ alembic/
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "focusquest.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--no-proxy-headers"]
