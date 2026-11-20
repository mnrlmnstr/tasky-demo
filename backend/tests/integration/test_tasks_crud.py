"""Task create, read, update and delete over HTTP, down to the real database."""

import logging
import uuid
from datetime import datetime

import httpx
import pytest

TASKS = "/api/v1/tasks"


@pytest.mark.anyio
async def test_create_task_returns_201_with_the_created_task(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.post(
        TASKS,
        json={
            "title": "Write the report",
            "description": "Quarterly numbers",
            "status": "in_progress",
            "priority": "high",
            "deadline": "2026-12-01T09:00:00+02:00",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Write the report"
    assert body["description"] == "Quarterly numbers"
    assert body["status"] == "in_progress"
    assert body["priority"] == "high"
    assert datetime.fromisoformat(body["deadline"]) == datetime.fromisoformat(
        "2026-12-01T07:00:00+00:00"
    )
    assert uuid.UUID(body["id"]).version == 4
    assert set(body) == {
        "id",
        "title",
        "description",
        "status",
        "priority",
        "deadline",
        "created_at",
        "updated_at",
        "position",
    }


@pytest.mark.anyio
async def test_get_task_returns_the_saved_task(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json={"title": "Write the report"})).json()

    response = await rollback_client.get(f"{TASKS}/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


@pytest.mark.anyio
async def test_get_unknown_task_returns_404(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.get(f"{TASKS}/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


@pytest.mark.anyio
async def test_create_task_defaults_to_todo_and_medium_without_description_or_deadline(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.post(TASKS, json={"title": "Write the report"})

    body = response.json()
    assert body["status"] == "todo"
    assert body["priority"] == "medium"
    assert body["description"] is None
    assert body["deadline"] is None


@pytest.mark.anyio
async def test_create_task_trims_the_title(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.post(TASKS, json={"title": "  Write the report  "})

    assert response.status_code == 201
    assert response.json()["title"] == "Write the report"


@pytest.mark.anyio
async def test_create_task_accepts_a_200_character_title(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.post(TASKS, json={"title": "x" * 200})

    assert response.status_code == 201


@pytest.mark.anyio
async def test_create_task_returns_the_deadline_in_utc(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.post(
        TASKS, json={"title": "Write the report", "deadline": "2026-12-01T09:00:00+02:00"}
    )

    assert response.json()["deadline"] == "2026-12-01T07:00:00Z"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"title": ""}, "title"),
        ({"title": "   "}, "title"),
        ({"title": "x" * 201}, "title"),
        ({"title": None}, "title"),
        ({}, "title"),
        ({"title": "Write", "status": "blocked"}, "status"),
        ({"title": "Write", "priority": "urgent"}, "priority"),
        ({"title": "Write", "deadline": "2026-12-01T09:00:00"}, "deadline"),
        ({"title": "Write", "deadline": "tomorrow"}, "deadline"),
        ({"title": "Write", "owner": "me"}, "owner"),
        ({"title": "Write", "id": str(uuid.uuid4())}, "id"),
        ({"title": "Write", "created_at": "2026-12-01T09:00:00Z"}, "created_at"),
    ],
)
async def test_create_task_rejects_invalid_body_with_a_field_error(
    rollback_client: httpx.AsyncClient, body: dict[str, object], field: str
) -> None:
    response = await rollback_client.post(TASKS, json=body)

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", field]]


FULL_TASK = {
    "title": "Write the report",
    "description": "Quarterly numbers",
    "status": "todo",
    "priority": "low",
    "deadline": "2026-12-01T07:00:00Z",
}


@pytest.mark.anyio
async def test_update_task_changes_only_the_sent_fields(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(
        f"{TASKS}/{created['id']}", json={"status": "done", "title": "  Final report "}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "done"
    assert body["title"] == "Final report"
    assert body["description"] == "Quarterly numbers"
    assert body["priority"] == "low"
    assert body["deadline"] == "2026-12-01T07:00:00Z"
    assert body["created_at"] == created["created_at"]


@pytest.mark.anyio
async def test_update_task_is_persisted(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()
    updated = (
        await rollback_client.patch(f"{TASKS}/{created['id']}", json={"priority": "high"})
    ).json()

    response = await rollback_client.get(f"{TASKS}/{created['id']}")

    assert response.json() == updated


@pytest.mark.anyio
async def test_update_task_with_null_clears_description_and_deadline(
    rollback_client: httpx.AsyncClient,
) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(
        f"{TASKS}/{created['id']}", json={"description": None, "deadline": None}
    )

    body = response.json()
    assert body["description"] is None
    assert body["deadline"] is None
    assert body["title"] == "Write the report"


@pytest.mark.anyio
async def test_update_task_returns_the_deadline_in_utc(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(
        f"{TASKS}/{created['id']}", json={"deadline": "2027-01-10T18:30:00-05:00"}
    )

    assert response.json()["deadline"] == "2027-01-10T23:30:00Z"


@pytest.mark.anyio
async def test_update_task_moves_updated_at_forward(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"priority": "high"})

    assert datetime.fromisoformat(response.json()["updated_at"]) > datetime.fromisoformat(
        created["updated_at"]
    )


@pytest.mark.anyio
async def test_update_task_keeps_created_at(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"priority": "high"})
    fetched = await rollback_client.get(f"{TASKS}/{created['id']}")

    assert response.json()["created_at"] == created["created_at"]
    assert fetched.json()["created_at"] == created["created_at"]


@pytest.mark.anyio
async def test_update_task_with_unchanged_values_still_moves_updated_at_forward(
    rollback_client: httpx.AsyncClient,
) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"priority": "low"})

    assert datetime.fromisoformat(response.json()["updated_at"]) > datetime.fromisoformat(
        created["updated_at"]
    )


@pytest.mark.anyio
async def test_update_unknown_task_returns_404(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.patch(f"{TASKS}/{uuid.uuid4()}", json={"status": "done"})

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"title": None}, "title"),
        ({"status": None}, "status"),
        ({"priority": None}, "priority"),
        ({"title": "   "}, "title"),
        ({"title": "x" * 201}, "title"),
        ({"status": "blocked"}, "status"),
        ({"priority": "urgent"}, "priority"),
        ({"deadline": "2026-12-01T09:00:00"}, "deadline"),
        ({"owner": "me"}, "owner"),
        ({"id": str(uuid.uuid4())}, "id"),
        ({"updated_at": "2026-12-01T09:00:00Z"}, "updated_at"),
    ],
)
async def test_update_task_rejects_invalid_body_with_a_field_error(
    rollback_client: httpx.AsyncClient, body: dict[str, object], field: str
) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(f"{TASKS}/{created['id']}", json=body)

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", field]]


@pytest.mark.anyio
async def test_malformed_task_id_returns_422(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.get(f"{TASKS}/not-a-uuid")

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["path", "task_id"]]


@pytest.mark.anyio
async def test_delete_task_returns_204_with_no_body(rollback_client: httpx.AsyncClient) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.delete(f"{TASKS}/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method", "body"),
    [("GET", None), ("PATCH", {"status": "done"}), ("DELETE", None)],
)
async def test_deleted_task_is_gone(
    rollback_client: httpx.AsyncClient, method: str, body: dict[str, object] | None
) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()
    await rollback_client.delete(f"{TASKS}/{created['id']}")

    response = await rollback_client.request(method, f"{TASKS}/{created['id']}", json=body)

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


@pytest.mark.anyio
async def test_delete_unknown_task_returns_404(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.delete(f"{TASKS}/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


@pytest.mark.anyio
async def test_task_changes_are_logged_with_the_task_id_and_no_content(
    rollback_client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.tasks"):
        created = (await rollback_client.post(TASKS, json={"title": "Secret plan"})).json()
        url = f"{TASKS}/{created['id']}"
        await rollback_client.patch(url, json={"title": "Other secret", "status": "done"})
        await rollback_client.delete(url)

    records = [r for r in caplog.records if r.name == "app.services.tasks"]
    assert [(r.levelno, r.getMessage()) for r in records] == [
        (logging.INFO, "task_created"),
        (logging.INFO, "task_updated"),
        (logging.INFO, "task_deleted"),
    ]
    assert all(vars(r)["task_id"] == created["id"] for r in records)
    assert vars(records[1])["fields"] == "status,title"
    logged = [str(value) for r in records for value in vars(r).values()]
    assert not any("secret" in value.lower() for value in logged)


@pytest.mark.anyio
async def test_failed_change_of_unknown_task_logs_no_event(
    rollback_client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.tasks"):
        await rollback_client.patch(f"{TASKS}/{uuid.uuid4()}", json={"status": "done"})
        await rollback_client.delete(f"{TASKS}/{uuid.uuid4()}")

    assert [r for r in caplog.records if r.name == "app.services.tasks"] == []


# Raw JSON so a lone surrogate (\ud800) reaches the server as JSON allows; httpx can't encode it.
UNSTORABLE_TEXT = ["a\\u0000b", "a\\ud800b", "a\\udfffb"]
UNREPRESENTABLE_DEADLINES = ["0001-01-01T00:00:00+01:00", "9999-12-31T23:30:00-01:00"]


def _raw_json(field: str, escaped_value: str, title: str | None = "t") -> bytes:
    fields = [f'"{field}": "{escaped_value}"']
    if title is not None and field != "title":
        fields.insert(0, f'"title": "{title}"')
    return ("{" + ", ".join(fields) + "}").encode()


@pytest.mark.anyio
@pytest.mark.parametrize("field", ["title", "description"])
@pytest.mark.parametrize("text", UNSTORABLE_TEXT)
async def test_create_task_rejects_text_the_database_cannot_store(
    rollback_client: httpx.AsyncClient, field: str, text: str
) -> None:
    response = await rollback_client.post(
        TASKS, content=_raw_json(field, text), headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", field]]


@pytest.mark.anyio
@pytest.mark.parametrize("field", ["title", "description"])
@pytest.mark.parametrize("text", UNSTORABLE_TEXT)
async def test_update_task_rejects_text_the_database_cannot_store(
    rollback_client: httpx.AsyncClient, field: str, text: str
) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(
        f"{TASKS}/{created['id']}",
        content=_raw_json(field, text, title=None),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", field]]


# A 422 echoes the rejected input, so it must be able to carry a lone surrogate too.
@pytest.mark.anyio
@pytest.mark.parametrize(
    ("body", "loc"),
    [
        (b'{"title": "t", "status": "\\ud800"}', ["body", "status"]),
        (b'{"title": "t", "\\ud800": "x"}', ["body"]),
        (b'{"title": "t", "deadline": "\\ud800"}', ["body", "deadline"]),
        (b'{"title": "' + b"\\ud800" * 201 + b'"}', ["body", "title"]),
    ],
)
async def test_field_errors_on_input_with_a_lone_surrogate_are_422(
    rollback_client: httpx.AsyncClient, body: bytes, loc: list[str]
) -> None:
    response = await rollback_client.post(
        TASKS, content=body, headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [loc]


@pytest.mark.anyio
@pytest.mark.parametrize("deadline", UNREPRESENTABLE_DEADLINES)
async def test_create_task_rejects_a_deadline_outside_the_utc_range(
    rollback_client: httpx.AsyncClient, deadline: str
) -> None:
    response = await rollback_client.post(TASKS, json={"title": "t", "deadline": deadline})

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "deadline"]]


@pytest.mark.anyio
@pytest.mark.parametrize("deadline", UNREPRESENTABLE_DEADLINES)
async def test_update_task_rejects_a_deadline_outside_the_utc_range(
    rollback_client: httpx.AsyncClient, deadline: str
) -> None:
    created = (await rollback_client.post(TASKS, json=FULL_TASK)).json()

    response = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"deadline": deadline})

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "deadline"]]
