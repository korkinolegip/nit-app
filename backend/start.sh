#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding questions if needed..."
python -m db.seed_questions || true

echo "Starting Нить services..."
arq workers.main.WorkerSettings &
arq workers.moderation_worker.WorkerSettings &
python -m bot.main &

exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
