"""Counterexamples against issues #4-#7 (tasks API), through the HTTP interface."""

import json
from datetime import datetime

import httpx
import pytest

TASKS = "/api/v1/tasks"


# Agreed rule: "any deadline date is allowed"; #4: "Deadlines accepted as timezone-aware
# ISO 8601 and stored in UTC". Unhandled errors must not be the answer to valid input.
@pytest.mark.anyio
@pytest.mark.parametrize(
    ("deadline", "utc"),
    [
        ("0001-01-01T00:00:00Z", "0001-01-01T00:00:00+00:00"),
        ("0001-01-01T12:00:00+01:00", "0001-01-01T11:00:00+00:00"),
        ("9999-12-31T12:00:00-01:00", "9999-12-31T13:00:00+00:00"),
    ],
)
async def test_create_task_accepts_any_aware_deadline(
    rollback_client: httpx.AsyncClient, deadline: str, utc: str
) -> None:
    response = await rollback_client.post(TASKS, json={"title": "t", "deadline": deadline})

    assert response.status_code == 201
    assert datetime.fromisoformat(response.json()["deadline"]) == datetime.fromisoformat(utc)


# Agreed rule: "any deadline date is allowed". A deadline whose UTC form falls outside
# the representable range must at worst be a 422 field error, never a 500.
@pytest.mark.anyio
@pytest.mark.parametrize(
    "deadline", ["0001-01-01T00:00:00+01:00", "9999-12-31T23:30:00-01:00"]
)
async def test_deadline_out_of_utc_range_is_not_a_500(
    rollback_client: httpx.AsyncClient, deadline: str
) -> None:
    response = await rollback_client.post(TASKS, json={"title": "t", "deadline": deadline})

    assert response.status_code in (201, 422), response.text


@pytest.mark.anyio
async def test_patch_deadline_out_of_utc_range_is_not_a_500(
    rollback_client: httpx.AsyncClient,
) -> None:
    created = (await rollback_client.post(TASKS, json={"title": "t"})).json()

    response = await rollback_client.patch(
        f"{TASKS}/{created['id']}", json={"deadline": "0001-01-01T00:00:00+01:00"}
    )

    assert response.status_code in (200, 422), response.text


# #4: "title required, trimmed, 1-200 chars". A 1-char title holding NUL is either stored
# or rejected as a field error; a 500 is neither.
@pytest.mark.anyio
@pytest.mark.parametrize(
    "body",
    [{"title": "a\u0000b"}, {"title": "ok", "description": "a\u0000b"}],
)
async def test_create_task_with_nul_character_is_not_a_500(
    rollback_client: httpx.AsyncClient, body: dict[str, str]
) -> None:
    response = await rollback_client.post(TASKS, json=body)

    assert response.status_code in (201, 422), response.text


@pytest.mark.anyio
async def test_patch_task_with_nul_character_is_not_a_500(
    rollback_client: httpx.AsyncClient,
) -> None:
    created = (await rollback_client.post(TASKS, json={"title": "t"})).json()

    response = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"title": "a\u0000"})

    assert response.status_code in (200, 422), response.text


# #6: "search - case-insensitive substring match on title". No title contains NUL, so the
# search matches nothing (or is a 422); it must not crash.
@pytest.mark.anyio
async def test_search_with_nul_character_is_not_a_500(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.get(TASKS, params={"search": "a\u0000"})

    assert response.status_code in (200, 422), response.text


# #4: title is a string; a lone surrogate can't be stored as UTF-8.
@pytest.mark.anyio
async def test_create_task_with_lone_surrogate_is_not_a_500(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.post(
        TASKS,
        content=b'{"title": "a\\ud800b"}',
        headers={"content-type": "application/json"},
    )

    assert response.status_code in (201, 422), response.text


# #6: "search - case-insensitive substring match on title".
@pytest.mark.anyio
async def test_search_ignores_case_of_non_ascii_letters(rollback_client: httpx.AsyncClient) -> None:
    await rollback_client.post(TASKS, json={"title": "ÄRGER mit Öl"})

    response = await rollback_client.get(TASKS, params={"search": "ärger"})

    assert [t["title"] for t in response.json()["items"]] == ["ÄRGER mit Öl"]


# #4: "Deadlines accepted as timezone-aware ISO 8601". A naive datetime is rejected.
@pytest.mark.anyio
async def test_naive_deadline_is_rejected(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.post(
        TASKS, json={"title": "t", "deadline": "2026-12-01T09:00:00"}
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "deadline"]


# Agreed rule: "title is trimmed and 1-200 chars" - trimming happens before the length check.
@pytest.mark.anyio
async def test_patch_title_is_trimmed_and_length_checked_after_trimming(
    rollback_client: httpx.AsyncClient,
) -> None:
    created = (await rollback_client.post(TASKS, json={"title": "t"})).json()

    ok = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"title": f"  {'x' * 200}  "})
    blank = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"title": " \t\n "})
    long = await rollback_client.patch(f"{TASKS}/{created['id']}", json={"title": "x" * 201})

    assert ok.status_code == 200
    assert ok.json()["title"] == "x" * 200
    assert blank.status_code == 422
    assert long.status_code == 422


# Agreed rule: "request bodies reject unknown and read-only fields with 422".
@pytest.mark.anyio
@pytest.mark.parametrize("field", ["id", "created_at", "updated_at", "deleted_at"])
async def test_patch_rejects_read_only_fields(
    rollback_client: httpx.AsyncClient, field: str
) -> None:
    created = (await rollback_client.post(TASKS, json={"title": "t"})).json()

    response = await rollback_client.patch(
        f"{TASKS}/{created['id']}", json={field: "2026-01-01T00:00:00+00:00"}
    )

    assert response.status_code == 422


def _reject_non_json_constant(name: str) -> None:
    raise ValueError(f"{name} is not valid JSON")


# Agreed rule: errors use FastAPI's standard shape, a 422 field-error list. The request
# parser accepts NaN/Infinity, and the 422 renderer echoes the input back; the body must
# still be valid JSON (RFC 8259 has no NaN or Infinity).
@pytest.mark.anyio
@pytest.mark.parametrize(
    "raw",
    [
        b'{"title": NaN}',
        b'{"title": "t", "priority": Infinity}',
        b'{"title": "t", "status": -Infinity}',
    ],
)
async def test_422_body_echoing_non_finite_number_is_valid_json(
    rollback_client: httpx.AsyncClient, raw: bytes
) -> None:
    response = await rollback_client.post(
        TASKS, content=raw, headers={"content-type": "application/json"}
    )

    assert response.status_code == 422
    body = json.loads(response.text, parse_constant=_reject_non_json_constant)
    assert isinstance(body["detail"], list)
