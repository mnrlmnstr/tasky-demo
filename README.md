# Tasky — Task Manager

A full-stack task manager built as a test assignment: a Python REST API backed by PostgreSQL, with a Vue 3 single-page frontend, all running through Docker Compose.

> **Status:** work in progress. The backend is being built first; see the [Backend MVP](https://github.com/mnrlmnstr/tasky-demo/milestone/1) and [Frontend](https://github.com/mnrlmnstr/tasky-demo/milestone/2) milestones for progress.

## Requirements

### Backend

Task model:

| Field        | Type                              | Notes                          |
| ------------ | --------------------------------- | ------------------------------ |
| `id`         | integer                           | primary key                    |
| `title`      | string (1–200)                    | required                       |
| `description`| text                              | optional                       |
| `status`     | `todo` \| `in_progress` \| `done` | default `todo`                 |
| `priority`   | `low` \| `medium` \| `high`       | default `medium`               |
| `deadline`   | datetime (UTC)                    | optional                       |
| `created_at` | datetime (UTC)                    | set by the server              |
| `updated_at` | datetime (UTC)                    | updated by the server on write |

Functionality:

- create, read (list and single), update and delete tasks
- filter by status
- search by title
- sort by creation date or deadline
- pagination

### Frontend

A UI for the API that lets the user:

- view the task list, create, edit and delete tasks, change status
- search, filter and sort
- see error messages and loading indicators

### Extras

- Docker / Docker Compose, README with run instructions
- Nice to have: unit tests, Swagger / OpenAPI, demo data for quick testing

## Tech stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Backend  | Python 3.13, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic, uv |
| Database | PostgreSQL 17                                                 |
| Frontend | Vue 3, Vite, TypeScript, npm                                  |
| Tests    | pytest, httpx, Vitest                                         |
| Infra    | Docker, Docker Compose                                        |

## Planned API

Base path: `/api/v1`

| Method   | Path          | Description                    |
| -------- | ------------- | ------------------------------ |
| `GET`    | `/health`     | liveness / database check      |
| `GET`    | `/tasks`      | list tasks (see query params)  |
| `POST`   | `/tasks`      | create a task                  |
| `GET`    | `/tasks/{id}` | get one task                   |
| `PATCH`  | `/tasks/{id}` | partially update a task        |
| `DELETE` | `/tasks/{id}` | delete a task                  |

Query parameters for `GET /tasks`:

| Param       | Example           | Description                                                        |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| `status`    | `in_progress`     | filter by status                                                   |
| `search`    | `report`          | case-insensitive match on title                                    |
| `ordering`  | `-created_at`     | `created_at`, `deadline`; prefix with `-` for descending           |
| `page`      | `1`               | page number, starting at 1                                         |
| `page_size` | `20`              | items per page (max 100)                                           |

List response shape:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20,
  "pages": 0
}
```

Interactive docs will be served at `/docs` (Swagger UI) and `/redoc`.

## Project structure (planned)

```
tasky-demo/
├── backend/
│   ├── app/
│   │   ├── api/          # routers and dependencies
│   │   ├── core/         # settings, database session
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # business logic / queries
│   │   └── main.py
│   ├── alembic/          # migrations
│   ├── tests/
│   ├── Dockerfile
│   ├── entrypoint.sh     # migrations, demo data, then the server
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/             # Vue 3 + Vite + TypeScript app
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## Running the project

> This describes the target setup; it works once [issue #1](https://github.com/mnrlmnstr/tasky-demo/issues/1) is done.

The only requirement is Docker with Docker Compose.

```bash
docker compose up
```

That one command starts the database, the backend and the frontend. No `.env` file is needed: the compose file has working defaults. On first start the backend applies migrations and loads demo tasks.

| What        | URL                         |
| ----------- | --------------------------- |
| Application | http://localhost:8080       |
| Swagger UI  | http://localhost:8000/docs  |
| API         | http://localhost:8000/api/v1 |

The frontend proxies `/api` to the backend, so the browser only talks to `localhost:8080`. PostgreSQL is not published to the host.

### Optional

Override defaults (ports, database credentials, demo data) by copying `.env.example` to `.env` and editing it. Set `SEED_DEMO_DATA=false` to start with an empty database.

Live-sync source changes into the running containers while developing:

```bash
docker compose up --watch
```

Run tests:

```bash
docker compose exec backend pytest
docker compose exec frontend npm test
```

Reset everything, including the database:

```bash
docker compose down -v
```

## Roadmap

1. **Backend MVP** — Docker setup, API, tests, OpenAPI, demo data
2. **Frontend** — Vue 3 UI for the API
3. **Polish** — final README, end-to-end check of the Compose setup
