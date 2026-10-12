#!/bin/sh
# Container entrypoint (used by Render and any plain `docker run`).
# Migrates, seeds (idempotent) and serves on $PORT (Render sets it; defaults to 8000 elsewhere).
set -e
alembic upgrade head
python -m scripts.seed
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
