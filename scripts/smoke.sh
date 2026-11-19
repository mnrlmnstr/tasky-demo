#!/usr/bin/env bash
# Smoke test for the whole stack: builds and starts db, backend and frontend,
# checks them from the host the way a user would, then removes everything.
#
#   scripts/smoke.sh
#   FRONTEND_PORT=18080 BACKEND_PORT=18000 scripts/smoke.sh   # if 8080/8000 are taken
#
# It runs under its own compose project (SMOKE_PROJECT_NAME, default "tasky-smoke"),
# so it never touches the containers or the database volume of a stack you are running.
set -eu

cd "$(dirname "$0")/.."

export FRONTEND_PORT="${FRONTEND_PORT:-8080}"
export BACKEND_PORT="${BACKEND_PORT:-8000}"
PROJECT="${SMOKE_PROJECT_NAME:-tasky-smoke}"
WAIT_TIMEOUT="${SMOKE_WAIT_TIMEOUT:-300}"
LOG_TAIL="${SMOKE_LOG_TAIL:-50}"

FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"
EXPECTED_HEALTH='{"status":"ok"}'

# The teardown removes the project's volumes. Under the project name of the real stack
# that would delete the developer's database, so that name is refused before anything starts.
REAL_PROJECT="$(sed -n 's/^name:[[:space:]]*\([^[:space:]#]*\).*/\1/p' docker-compose.yml | tr -d "\"'")"
[ -n "$REAL_PROJECT" ] || {
  echo "SMOKE FAILED: cannot read the project name (top-level 'name:') from docker-compose.yml" >&2
  exit 1
}
for reserved in "$REAL_PROJECT" "${COMPOSE_PROJECT_NAME:-}"; do
  if [ -n "$reserved" ] && [ "$PROJECT" = "$reserved" ]; then
    echo "SMOKE FAILED: SMOKE_PROJECT_NAME='${PROJECT}' is the project name of the real stack;" \
      "the smoke test removes its project's volumes and would delete your database." \
      "Use another name (default: tasky-smoke). Nothing was started or removed." >&2
    exit 1
  fi
done

compose() {
  docker compose -p "$PROJECT" "$@"
}

fail() {
  # The stack is removed on exit, so its state and logs are shown first:
  # afterwards there is nothing left to inspect.
  echo "--- service state and last ${LOG_TAIL} log lines per service" >&2
  compose ps -a >&2 || true
  compose logs --no-color --tail "$LOG_TAIL" >&2 || true
  echo "SMOKE FAILED: $*" >&2
  exit 1
}

teardown() {
  echo "--- tearing down project ${PROJECT}"
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap teardown EXIT

http_status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" || true
}

echo "--- building and starting project ${PROJECT} (frontend :${FRONTEND_PORT}, backend :${BACKEND_PORT})"
compose up --build --wait --wait-timeout "$WAIT_TIMEOUT" \
  || fail "the stack did not build or did not become healthy within ${WAIT_TIMEOUT}s"

echo "--- frontend page"
status="$(http_status "${FRONTEND_URL}/")"
[ "$status" = "200" ] \
  || fail "frontend page ${FRONTEND_URL}/ answered ${status}, expected 200"

echo "--- API health through the frontend proxy"
body="$(curl -s --max-time 10 "${FRONTEND_URL}/api/v1/health" | tr -d '[:space:]' || true)"
[ "$body" = "$EXPECTED_HEALTH" ] \
  || fail "${FRONTEND_URL}/api/v1/health returned '${body}', expected '${EXPECTED_HEALTH}' (is /api proxied to the backend?)"

echo "--- Swagger UI on the backend port"
status="$(http_status "${BACKEND_URL}/docs")"
[ "$status" = "200" ] \
  || fail "Swagger UI ${BACKEND_URL}/docs answered ${status}, expected 200"

echo "--- database is healthy and not published to the host"
db_container="$(compose ps -q db)" \
  || fail "could not look up the container of the db service"
[ -n "$db_container" ] || fail "the db service has no container"
db_health="$(docker inspect --format '{{.State.Health.Status}}' "$db_container")" \
  || fail "could not read the health status of the db container"
[ "$db_health" = "healthy" ] \
  || fail "the db service is '${db_health}', expected 'healthy'"
db_ports="$(docker port "$db_container")" \
  || fail "could not read the published ports of the db container"
[ -z "$db_ports" ] \
  || fail "the db service is published to the host (${db_ports}); it must stay internal"

echo "--- migrations created the tasks table in the app database"
# POSTGRES_USER/POSTGRES_DB are read inside the db container, so this is the database
# the backend uses (DATABASE_URL), not the separate test database.
tasks_table="$(compose exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT to_regclass('"'"'public.tasks'"'"')"')" \
  || fail "could not query the app database for the tasks table"
[ "$(printf '%s' "$tasks_table" | tr -d '[:space:]')" = "tasks" ] \
  || fail "the tasks table does not exist in the app database (did 'alembic upgrade head' run in backend/entrypoint.sh?)"

echo "SMOKE OK"
