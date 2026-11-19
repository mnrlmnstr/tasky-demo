# Tasky — Task Manager

A full-stack task manager built as a test assignment: a Python REST API backed by PostgreSQL, with a Vue 3 single-page frontend, all running through Docker Compose.

> **Status:** the backend is done (API, tests, OpenAPI docs, demo data). The frontend is in progress: for now it is a placeholder page that reports whether the API is healthy. See the [Frontend](https://github.com/mnrlmnstr/tasky-demo/milestone/2) milestone.

## Tech stack

| Layer    | Choice                                                            |
| -------- | ----------------------------------------------------------------- |
| Backend  | Python 3.13, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic, uv |
| Database | PostgreSQL 17                                                     |
| Frontend | Vue 3, Vite, TypeScript, npm                                      |
| Tests    | pytest, pytest-cov, httpx, Vitest                                 |
| Infra    | Docker, Docker Compose                                            |

## Quick start

The only requirement is Docker with Docker Compose. From a clean clone:

```bash
docker compose up
```

That one command starts the database, the backend and the frontend. No `.env` file is needed: the compose file has working defaults. On start the backend applies the database migrations and loads the demo data.

| What        | URL                                  |
| ----------- | ------------------------------------ |
| Application | http://localhost:8080                |
| Swagger UI  | http://localhost:8000/docs           |
| ReDoc       | http://localhost:8000/redoc          |
| API health  | http://localhost:8000/api/v1/health  |

The frontend proxies `/api` to the backend, so the browser only talks to `localhost:8080`. PostgreSQL is not published to the host.

Stop and delete everything, including the database:

```bash
docker compose down -v
```

### Demo data

On first start the backend loads 30 demo tasks (titles and descriptions in Ukrainian) with mixed statuses and priorities, past, future and missing deadlines, and creation dates spread over the last 30 days. They are loaded only into a tasks table with no rows at all (soft-deleted tasks count), so restarts add nothing and your changes are kept.

- Start with an empty database: set `SEED_DEMO_DATA=false` (in `.env` or the shell) before the first start.
- Replace all tasks with a fresh demo set at any time:

  ```bash
  docker compose exec backend python -m app.seed --reset
  ```

### Environment variables

All are optional. To override them, copy `.env.example` to `.env` and edit the copy.

| Variable            | Default  | Description                                                     |
| ------------------- | -------- | --------------------------------------------------------------- |
| `FRONTEND_PORT`     | `8080`   | host port of the application                                    |
| `BACKEND_PORT`      | `8000`   | host port of the API and its docs                               |
| `POSTGRES_USER`     | `tasky`  | database user                                                   |
| `POSTGRES_PASSWORD` | `tasky`  | database password                                               |
| `POSTGRES_DB`       | `tasky`  | database name                                                   |
| `SEED_DEMO_DATA`    | `true`   | load the demo tasks on start; `false` starts with an empty database |

`POSTGRES_USER` and `POSTGRES_PASSWORD` are inserted as they are into the backend's database URL, so they must be URL-safe: no `@`, `/` or `:` (letters, digits, `-` and `_` are fine). The credentials are applied when the database volume is first created; to change them later, reset the volume with `docker compose down -v`.

## API

Base path: `/api/v1` (the base path itself answers 404). Full schemas and examples: [Swagger UI](http://localhost:8000/docs) or [ReDoc](http://localhost:8000/redoc).

| Method   | Path          | Description                          | Success |
| -------- | ------------- | ------------------------------------ | ------- |
| `GET`    | `/health`     | liveness and database check          | `200`   |
| `GET`    | `/tasks`      | list tasks (see query parameters)    | `200`   |
| `POST`   | `/tasks`      | create a task                        | `201`   |
| `GET`    | `/tasks/{id}` | get one task                         | `200`   |
| `PATCH`  | `/tasks/{id}` | partially update a task              | `200`   |
| `DELETE` | `/tasks/{id}` | delete a task (soft delete)          | `204`   |

A task:

| Field         | Type                              | Notes                                   |
| ------------- | --------------------------------- | --------------------------------------- |
| `id`          | UUID (v4)                         | set by the server                       |
| `title`       | string, 1–200 characters          | required; surrounding spaces are trimmed |
| `description` | string or `null`                  | optional                                |
| `status`      | `todo` \| `in_progress` \| `done` | default `todo`                          |
| `priority`    | `low` \| `medium` \| `high`       | default `medium`                        |
| `deadline`    | datetime with a time zone, or `null` | optional; returned in UTC            |
| `created_at`  | datetime (UTC)                    | set by the server                       |
| `updated_at`  | datetime (UTC)                    | set by the server on every update       |

`PATCH` changes only the fields it is sent; `null` clears `description` or `deadline`. Unknown and read-only fields are rejected.

Query parameters for `GET /tasks`:

| Param       | Example       | Description                                                                                        |
| ----------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `status`    | `in_progress` | filter by status                                                                                   |
| `search`    | `звіт`        | case-insensitive substring of the title; `%` and `_` match literally                               |
| `ordering`  | `-created_at` | `created_at` or `deadline`, prefix `-` for descending; default `-created_at`; no deadline sorts last |
| `page`      | `1`           | page number, starting at 1 (default 1)                                                             |
| `page_size` | `20`          | items per page, 1–100 (default 20)                                                                 |

List response:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20,
  "pages": 0
}
```

`DELETE` is a soft delete: the task stays in the database but disappears from the API (getting, updating or deleting it again answers 404, and lists leave it out). There is no restore.

Errors:

| Status | When                                            | Body                                                        |
| ------ | ----------------------------------------------- | ----------------------------------------------------------- |
| `404`  | no task with that id, or it was deleted         | `{"detail": "Task not found"}`                               |
| `422`  | invalid body, query parameter or id             | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` |
| `500`  | unexpected server error (details go to the log) | `{"detail": "Internal server error"}`                        |

## Tests

With the stack running (`docker compose up`):

```bash
docker compose exec backend pytest
docker compose exec frontend npm test
```

The backend suite runs against a real PostgreSQL test database (`<POSTGRES_DB>_test` in the same `db` container, created on first run); each test is isolated by a rolled-back transaction. Coverage runs on every `pytest` and the run fails if coverage of `app/` lines and branches drops below 100%. To run a subset, turn coverage off:

```bash
docker compose exec backend pytest tests/integration/test_tasks_list.py --no-cov
```

Lint and format checks for the backend:

```bash
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
```

Regenerate the API client after an API change (on the host; needs the backend virtualenv and `npm install` in `frontend/`):

```bash
cd backend && .venv/bin/python -m scripts.export_openapi   # writes frontend/openapi.json
cd ../frontend && npm run api:generate                     # rewrites frontend/src/api/generated
```

Both outputs are committed. `frontend/src/api/generated` is never edited by hand, and nothing checks that it matches the API: run the two commands whenever a route or schema changes.

End-to-end check of the whole Compose setup (needs `curl` on the host):

```bash
scripts/smoke.sh
```

It builds and starts the stack under its own Compose project, checks the page, the API through the frontend proxy, Swagger UI and the database, then removes everything it started. It does not touch a stack you already have running, but it needs free ports: if 8080 or 8000 is taken, run `FRONTEND_PORT=18080 BACKEND_PORT=18000 scripts/smoke.sh`.

## Migrations

The backend runs `alembic upgrade head` every time it starts, so there is nothing to apply by hand.

To add a migration, change the models in `backend/app/models/`, then generate it inside the running container and copy it back to the host (the container's files are not shared with the host):

```bash
docker compose exec backend alembic revision --autogenerate --rev-id 0003 -m "describe the change"
docker compose cp backend:/app/alembic/versions/0003_describe_the_change.py backend/alembic/versions/
```

Review the generated file, then restart the backend (`docker compose restart backend`) to apply it. `docker compose exec backend alembic check` reports whether the models and the migrations agree.

## Development

Live-sync source changes into the running containers:

```bash
docker compose up --watch
```

Backend code and tests are synced and the server reloads; changes to migrations restart the backend (which applies them); changes to dependencies rebuild the image. The frontend works the same way with Vite's hot reload.

## Project structure

```
tasky-demo/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers, error handlers, OpenAPI setup
│   │   ├── services/     # business logic and queries (tasks, health, demo seed)
│   │   ├── models/       # SQLAlchemy models and enums
│   │   ├── schemas/      # Pydantic request and response schemas
│   │   ├── core/         # settings, database engine and sessions, logging
│   │   ├── seed.py       # `python -m app.seed [--reset]`
│   │   └── main.py       # app factory
│   ├── alembic/          # migrations
│   ├── tests/            # pytest suite (integration tests on PostgreSQL)
│   ├── Dockerfile
│   ├── entrypoint.sh     # migrations, demo data, then the server
│   └── pyproject.toml
├── frontend/             # Vue 3 + Vite + TypeScript app
├── scripts/
│   └── smoke.sh          # end-to-end check of the Compose setup
├── docker-compose.yml
├── .env.example
└── README.md
```

Requests flow `api → services → models`: routers validate input with the schemas and call plain service functions, which work on the SQLAlchemy models through an async session.
