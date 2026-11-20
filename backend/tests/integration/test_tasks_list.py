"""Listing tasks over HTTP: filters, search, ordering and pagination, down to the real database."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.integration.conftest import AddTask

TASKS = "/api/v1/tasks"
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def at(hours: int) -> datetime:
    return T0 + timedelta(hours=hours)


def titles(response: httpx.Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.anyio
async def test_list_returns_a_page_of_tasks_newest_first_by_default(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="older", created_at=at(0))
    await add_task(title="newer", created_at=at(1))

    response = await rollback_client.get(TASKS)

    assert response.status_code == 200
    body = response.json()
    assert [item["title"] for item in body["items"]] == ["newer", "older"]
    assert {key: body[key] for key in ("total", "page", "page_size", "pages")} == {
        "total": 2,
        "page": 1,
        "page_size": 20,
        "pages": 1,
    }
    assert set(body["items"][0]) == {
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
async def test_list_with_no_tasks_is_an_empty_first_page_of_zero_pages(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.get(TASKS)

    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20, "pages": 0}


@pytest.mark.anyio
async def test_list_leaves_out_deleted_tasks_from_items_and_total(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="kept", created_at=at(0))
    await add_task(title="deleted", created_at=at(1), deleted_at=at(2))

    response = await rollback_client.get(TASKS)

    assert titles(response) == ["kept"]
    assert response.json()["total"] == 1


@pytest.mark.anyio
async def test_list_filters_by_status(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="todo", status="todo", created_at=at(0))
    await add_task(title="doing", status="in_progress", created_at=at(1))
    await add_task(title="also doing", status="in_progress", created_at=at(2))

    response = await rollback_client.get(TASKS, params={"status": "in_progress"})

    assert titles(response) == ["also doing", "doing"]
    assert response.json()["total"] == 2


@pytest.mark.anyio
async def test_search_matches_a_title_substring_ignoring_case(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="Write the REPORT", created_at=at(0))
    await add_task(title="reporting duty", created_at=at(1))
    await add_task(title="Buy milk", created_at=at(2))

    response = await rollback_client.get(TASKS, params={"search": "Report"})

    assert titles(response) == ["reporting duty", "Write the REPORT"]
    assert response.json()["total"] == 2


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("search", "expected"),
    [
        ("50%", ["50% off"]),
        ("a_b", ["a_b"]),
        ("\\", ["back\\slash"]),
        ("/", ["either/or"]),
    ],
)
async def test_search_treats_like_wildcards_and_the_escape_character_literally(
    rollback_client: httpx.AsyncClient, add_task: AddTask, search: str, expected: list[str]
) -> None:
    await add_task(title="50% off", created_at=at(0))
    await add_task(title="500 boxes", created_at=at(1))
    await add_task(title="a_b", created_at=at(2))
    await add_task(title="axb", created_at=at(3))
    await add_task(title="back\\slash", created_at=at(4))
    await add_task(title="either/or", created_at=at(5))

    response = await rollback_client.get(TASKS, params={"search": search})

    assert titles(response) == expected


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("ordering", "expected"),
    [
        ("created_at", ["A", "B", "C", "D"]),
        ("-created_at", ["D", "C", "B", "A"]),
        ("deadline", ["C", "A", "D", "B"]),
        ("-deadline", ["A", "D", "C", "B"]),
    ],
)
async def test_ordering_sorts_with_missing_deadlines_last_and_ties_by_creation(
    rollback_client: httpx.AsyncClient, add_task: AddTask, ordering: str, expected: list[str]
) -> None:
    await add_task(title="A", created_at=at(0), deadline=at(10))
    await add_task(title="B", created_at=at(1), deadline=None)
    await add_task(title="C", created_at=at(2), deadline=at(5))
    await add_task(title="D", created_at=at(3), deadline=at(10))

    response = await rollback_client.get(TASKS, params={"ordering": ordering})

    assert titles(response) == expected


@pytest.mark.anyio
@pytest.mark.parametrize("ordering", ["created_at", "-created_at", "deadline", "-deadline"])
async def test_ordering_breaks_full_ties_by_id(
    rollback_client: httpx.AsyncClient, add_task: AddTask, ordering: str
) -> None:
    await add_task(title="second", id=uuid.UUID(int=2), created_at=at(0), deadline=at(5))
    await add_task(title="first", id=uuid.UUID(int=1), created_at=at(0), deadline=at(5))

    response = await rollback_client.get(TASKS, params={"ordering": ordering})

    assert titles(response) == ["first", "second"]


@pytest.mark.anyio
async def test_page_returns_its_slice_and_the_page_count(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    for hours, title in enumerate(["t0", "t1", "t2", "t3", "t4"]):
        await add_task(title=title, created_at=at(hours))

    response = await rollback_client.get(
        TASKS, params={"ordering": "created_at", "page": 2, "page_size": 2}
    )

    body = response.json()
    assert titles(response) == ["t2", "t3"]
    assert {key: body[key] for key in ("total", "page", "page_size", "pages")} == {
        "total": 5,
        "page": 2,
        "page_size": 2,
        "pages": 3,
    }


@pytest.mark.anyio
async def test_page_past_the_end_is_empty_with_the_real_total(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="only", created_at=at(0))

    response = await rollback_client.get(TASKS, params={"page": 3, "page_size": 1})

    body = response.json()
    assert response.status_code == 200
    assert body["items"] == []
    assert (body["total"], body["pages"]) == (1, 1)


@pytest.mark.anyio
async def test_page_far_beyond_any_offset_the_database_holds_is_empty(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="only", created_at=at(0))

    response = await rollback_client.get(TASKS, params={"page": 10**18, "page_size": 100})

    assert response.status_code == 200
    assert (response.json()["items"], response.json()["total"]) == ([], 1)


@pytest.mark.anyio
async def test_filters_combine_and_total_counts_only_matches(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="report one", status="done", created_at=at(0))
    await add_task(title="report two", status="done", created_at=at(1))
    await add_task(title="report three", status="todo", created_at=at(2))
    await add_task(title="milk", status="done", created_at=at(3))
    await add_task(title="report gone", status="done", created_at=at(4), deleted_at=at(5))

    response = await rollback_client.get(
        TASKS,
        params={"status": "done", "search": "report", "ordering": "created_at", "page_size": 1},
    )

    body = response.json()
    assert titles(response) == ["report one"]
    assert (body["total"], body["pages"]) == (2, 2)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "params",
    [
        {"status": "archived"},
        {"ordering": "title"},
        {"ordering": "-"},
        {"page": 0},
        {"page": "one"},
        {"page": -1},
        {"page_size": 0},
        {"page_size": "ten"},
        {"page_size": 101},
    ],
)
async def test_invalid_query_parameters_return_422(
    rollback_client: httpx.AsyncClient, params: dict[str, object]
) -> None:
    response = await rollback_client.get(TASKS, params=params)

    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.parametrize("query", [b"search=a%00b", b"search=%00", b"search=a%ED%A0%80b"])
async def test_search_rejects_text_no_title_can_hold(
    rollback_client: httpx.AsyncClient, query: bytes
) -> None:
    response = await rollback_client.get(f"{TASKS}?{query.decode()}")

    assert response.status_code in (200, 422), response.text
    if response.status_code == 422:
        assert [error["loc"] for error in response.json()["detail"]] == [["query", "search"]]


@pytest.mark.anyio
async def test_search_with_a_nul_character_is_a_field_error(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.get(TASKS, params={"search": "a\u0000"})

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["query", "search"]]


@pytest.mark.anyio
async def test_page_size_bounds_are_inclusive(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="only", created_at=at(0))

    smallest = await rollback_client.get(TASKS, params={"page_size": 1})
    largest = await rollback_client.get(TASKS, params={"page_size": 100})

    assert (smallest.status_code, largest.status_code) == (200, 200)
