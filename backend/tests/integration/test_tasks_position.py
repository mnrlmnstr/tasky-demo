"""Custom order: each task's `position`, set by PATCH and sorted by `ordering=position`."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from tests.integration.conftest import AddTask

TASKS = "/api/v1/tasks"
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

pytestmark = pytest.mark.anyio


def at(hours: int) -> datetime:
    return T0 + timedelta(hours=hours)


async def ordered_titles(client: httpx.AsyncClient, **params: object) -> list[str]:
    response = await client.get(TASKS, params={"ordering": "position", **params})
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


async def test_ordering_by_position_sorts_ascending(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="third", position=3.0, created_at=at(0))
    await add_task(title="first", position=-1.5, created_at=at(1))
    await add_task(title="second", position=0.25, created_at=at(2))

    assert await ordered_titles(rollback_client) == ["first", "second", "third"]


async def test_ordering_by_position_breaks_ties_newest_first_then_by_id(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="older", position=1.0, created_at=at(0))
    await add_task(title="newer b", id=uuid.UUID(int=2), position=1.0, created_at=at(1))
    await add_task(title="newer a", id=uuid.UUID(int=1), position=1.0, created_at=at(1))

    assert await ordered_titles(rollback_client) == ["newer a", "newer b", "older"]


async def test_a_task_moved_between_two_others_is_listed_between_them(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="a", position=0.0, created_at=at(0))
    await add_task(title="b", position=1.0, created_at=at(1))
    moved = await add_task(title="moved", position=2.0, created_at=at(2))

    response = await rollback_client.patch(f"{TASKS}/{moved.id}", json={"position": 0.5})

    assert response.status_code == 200
    assert response.json()["position"] == 0.5
    assert await ordered_titles(rollback_client) == ["a", "moved", "b"]


async def test_position_and_status_change_together(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    task = await add_task(title="task", position=4.0, created_at=at(0))

    response = await rollback_client.patch(
        f"{TASKS}/{task.id}", json={"status": "done", "position": -2}
    )

    body = response.json()
    assert (body["status"], body["position"]) == ("done", -2.0)


async def test_position_ordering_combines_with_filters_and_pages(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="done 2", status="done", position=2.0, created_at=at(0))
    await add_task(title="todo", status="todo", position=0.0, created_at=at(1))
    await add_task(title="done 1", status="done", position=1.0, created_at=at(2))
    await add_task(title="done 3", status="done", position=3.0, created_at=at(3))

    assert await ordered_titles(rollback_client, status="done", page=2, page_size=2) == ["done 3"]


async def test_a_new_task_goes_above_every_other_task(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="old top", position=-7.5, created_at=at(0))
    await add_task(title="old bottom", position=10.0, created_at=at(1))

    response = await rollback_client.post(TASKS, json={"title": "new"})

    assert response.json()["position"] < -7.5
    assert await ordered_titles(rollback_client) == ["new", "old top", "old bottom"]


async def test_each_new_task_goes_above_the_one_before(rollback_client: httpx.AsyncClient) -> None:
    for title in ["first", "second", "third"]:
        assert (await rollback_client.post(TASKS, json={"title": title})).status_code == 201

    assert await ordered_titles(rollback_client) == ["third", "second", "first"]


async def test_the_first_task_gets_a_finite_position(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.post(TASKS, json={"title": "only"})

    assert isinstance(response.json()["position"], float)


async def test_deleted_tasks_are_left_out_and_leave_the_others_in_place(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="a", position=0.0, created_at=at(0))
    gone = await add_task(title="gone", position=0.5, created_at=at(1))
    await add_task(title="b", position=1.0, created_at=at(2))

    await rollback_client.delete(f"{TASKS}/{gone.id}")

    items = (await rollback_client.get(TASKS, params={"ordering": "position"})).json()["items"]
    assert [(item["title"], item["position"]) for item in items] == [("a", 0.0), ("b", 1.0)]


async def test_a_deleted_task_below_the_top_does_not_set_where_new_tasks_go(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    await add_task(title="gone", position=-100.0, created_at=at(0), deleted_at=at(1))
    await add_task(title="kept", position=5.0, created_at=at(2))

    response = await rollback_client.post(TASKS, json={"title": "new"})

    assert -100.0 < response.json()["position"] < 5.0


async def test_moving_a_deleted_task_answers_404(
    rollback_client: httpx.AsyncClient, add_task: AddTask
) -> None:
    gone = await add_task(title="gone", position=0.0, created_at=at(0), deleted_at=at(1))

    response = await rollback_client.patch(f"{TASKS}/{gone.id}", json={"position": 1})

    assert response.status_code == 404


@pytest.mark.parametrize(
    "position",
    [None, "1.5", "top", True, [1], {"value": 1}],
)
async def test_update_rejects_a_position_that_is_not_a_number(
    rollback_client: httpx.AsyncClient, add_task: AddTask, position: object
) -> None:
    task = await add_task(title="task", position=0.0, created_at=at(0))

    response = await rollback_client.patch(f"{TASKS}/{task.id}", json={"position": position})

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "position"]]


@pytest.mark.parametrize("literal", [b"NaN", b"Infinity", b"-Infinity", b"1e999"])
async def test_update_rejects_a_position_that_is_not_finite(
    rollback_client: httpx.AsyncClient, add_task: AddTask, literal: bytes
) -> None:
    task = await add_task(title="task", position=0.0, created_at=at(0))

    response = await rollback_client.patch(
        f"{TASKS}/{task.id}",
        content=b'{"position": ' + literal + b"}",
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "position"]]


async def test_create_does_not_take_a_position(rollback_client: httpx.AsyncClient) -> None:
    response = await rollback_client.post(TASKS, json={"title": "task", "position": 1})

    assert response.status_code == 422
    assert [error["loc"] for error in response.json()["detail"]] == [["body", "position"]]
