#!/bin/sh
set -e

# --- Migrations: DISABLED placeholder, enabled in issue #3 ---
# alembic upgrade head

# --- Demo data: DISABLED placeholder, enabled in issue #10 ---
# if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
#     python -m app.seed
# fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
