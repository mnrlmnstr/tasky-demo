"""Filtering the task list by deadline: `deadline_from` inclusive, `deadline_to` exclusive."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.integration.conftest import AddTask

TASKS = "/api/v1/tasks"
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

pytestmark = pytest.mark.anyio


def at(hours: int) -> datetime:
    return T0 + timedelta(hours=hours)


def iso(hours: int) -> str:
    return at(hours).isoformat()


def titles(response: httpx.Response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


@pytest.fixture
async def deadlines(add_task: AddTask) -> None:
    """Tasks due at hours 0, 10, 20 and 30, one without a deadline and one deleted."""
    await add_task(title="due 0", created_at=at(0), deadline=at(0))
    await add_task(title="due 10", created_at=at(1), deadline=at(10))
    await add_task(title="due 20", created_at=at(2), deadline=at(20))
    await add_task(title="due 30", created_at=at(3), deadline=at(30))
    await add_task(title="no deadline", created_at=at(4), deadline=None)
    await add_task(title="deleted", created_at=at(5), deadline=at(10), deleted_at=at(6))


async def test_deadline_from_keeps_tasks_due_at_or_after_it(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": iso(10), "ordering": "deadline"}
    )

    assert titles(response) == ["due 10", "due 20", "due 30"]
    assert response.json()["total"] == 3


async def test_deadline_to_keeps_tasks_due_before_it(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_to": iso(20), "ordering": "deadline"}
    )

    assert titles(response) == ["due 0", "due 10"]


async def test_both_bounds_keep_the_range_from_inclusive_to_exclusive(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": iso(10), "deadline_to": iso(30), "ordering": "deadline"}
    )

    assert titles(response) == ["due 10", "due 20"]
    assert response.json()["total"] == 2


async def test_equal_bounds_are_an_empty_range(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": iso(10), "deadline_to": iso(10)}
    )

    assert titles(response) == []
    assert response.json()["total"] == 0


async def test_a_range_with_no_deadline_in_it_is_empty(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": iso(11), "deadline_to": iso(19)}
    )

    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20, "pages": 0}


async def test_bounds_with_another_offset_compare_as_the_same_instant(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    # 12:00 UTC + 10 h is 22:00 UTC, which is 00:00 the next day in Kyiv (UTC+2 in January).
    response = await rollback_client.get(
        TASKS,
        params={
            "deadline_from": "2026-01-02T00:00:00+02:00",
            "deadline_to": "2026-01-02T01:00+02:00",
        },
    )

    assert titles(response) == ["due 10"]


@pytest.mark.parametrize("params", [{"deadline_from": iso(5)}, {"deadline_to": iso(6)}])
async def test_tasks_without_a_deadline_are_left_out_while_a_bound_is_set(
    rollback_client: httpx.AsyncClient, add_task: AddTask, params: dict[str, str]
) -> None:
    await add_task(title="no deadline", created_at=at(0), deadline=None)
    await add_task(title="due", created_at=at(1), deadline=at(5))

    response = await rollback_client.get(TASKS, params=params)

    assert titles(response) == ["due"]


async def test_deleted_tasks_stay_out_of_a_deadline_filter(
    rollback_client: httpx.AsyncClient, deadlines: None
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": iso(10), "deadline_to": iso(11)}
    )

    assert titles(response) == ["due 10"]


async def test_deadline_filter_combines_with_status_search_ordering_and_pages(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="report a", status="done", created_at=at(0), deadline=at(12))
    await add_task(title="report b", status="done", created_at=at(1), deadline=at(11))
    await add_task(title="report c", status="done", created_at=at(2), deadline=at(13))
    await add_task(title="report late", status="done", created_at=at(3), deadline=at(40))
    await add_task(title="report todo", status="todo", created_at=at(4), deadline=at(12))
    await add_task(title="milk", status="done", created_at=at(5), deadline=at(12))

    response = await rollback_client.get(
        TASKS,
        params={
            "deadline_from": iso(10),
            "deadline_to": iso(24),
            "status": "done",
            "search": "REPORT",
            "ordering": "-deadline",
            "page": 2,
            "page_size": 2,
        },
    )

    body = response.json()
    assert titles(response) == ["report b"]
    assert (body["total"], body["pages"]) == (3, 2)


async def test_deadline_from_after_deadline_to_is_an_error_on_deadline_to(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": iso(11), "deadline_to": iso(10)}
    )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["query", "deadline_to"]]


@pytest.mark.parametrize(
    "params",
    [
        {"deadline_from": "2026-01-01"},
        {"deadline_from": "2026-01-01T00:00:00"},
        {"deadline_to": "tomorrow"},
        {"deadline_to": ""},
        {"deadline_to": "null"},
    ],
)
async def test_a_bound_that_is_not_a_timezone_aware_datetime_is_an_error(
    rollback_client: httpx.AsyncClient, params: dict[str, str]
) -> None:
    response = await rollback_client.get(TASKS, params=params)

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["query", *params]]


async def test_an_invalid_deadline_from_alone_is_reported_without_comparing_bounds(
    rollback_client: httpx.AsyncClient,
) -> None:
    response = await rollback_client.get(
        TASKS, params={"deadline_from": "soon", "deadline_to": iso(10)}
    )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["query", "deadline_from"]]
