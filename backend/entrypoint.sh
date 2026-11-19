#!/bin/sh
set -e

# --- Migrations: the database schema is brought up to date before the server starts ---
alembic upgrade head

# --- Demo data: loaded only into a tasks table with no rows at all, so a restart adds nothing ---
seed_flag=$(printf '%s' "${SEED_DEMO_DATA:-true}" | tr '[:upper:]' '[:lower:]')
case "$seed_flag" in
    false|0|no|off)
        echo "Demo data seed skipped (SEED_DEMO_DATA=${SEED_DEMO_DATA})"
        ;;
    *)
        python -m app.seed
        ;;
esac

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
