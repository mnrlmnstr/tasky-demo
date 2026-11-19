"""The demo seed (`python -m app.seed`), run through its CLI entry point against the test database.

The seed commits for real, so every test starts and ends with an empty tasks table. Results are
read back over the HTTP API, the way a reviewer would see them.
"""

from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta

import anyio
import httpx
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncEngine

from app import seed
from app.models.task import Task

TASKS = "/api/v1/tasks"


@pytest.fixture
async def empty_tasks(db_engine: AsyncEngine) -> AsyncIterator[None]:
    async def _wipe() -> None:
        async with db_engine.begin() as connection:
            await connection.execute(delete(Task))

    await _wipe()
    yield
    await _wipe()


async def run_seed(*args: str) -> int:
    # main() starts its own event loop, as `python -m app.seed` does, so it runs in a thread.
    return await anyio.to_thread.run_sync(seed.main, list(args))


async def all_tasks(client: httpx.AsyncClient) -> list[dict]:
    response = await client.get(TASKS, params={"page_size": 100})
    return response.json()["items"]


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_seed_on_an_empty_database_creates_about_thirty_tasks(
    client: httpx.AsyncClient,
) -> None:
    exit_code = await run_seed()

    body = (await client.get(TASKS)).json()
    assert exit_code == 0
    assert 25 <= body["total"] <= 35


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_seed_does_nothing_when_tasks_already_exist(client: httpx.AsyncClient) -> None:
    await run_seed()
    before = await all_tasks(client)

    await run_seed()

    assert await all_tasks(client) == before


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_the_documented_search_example_finds_seeded_tasks(
    client: httpx.AsyncClient,
) -> None:
    await run_seed()
    parameters = (await client.get("/openapi.json")).json()["paths"][TASKS]["get"]["parameters"]
    [search] = [p for p in parameters if p["name"] == "search"]

    found = (await client.get(TASKS, params={"search": search["schema"]["examples"][0]})).json()

    assert found["total"] > 1


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_seed_does_nothing_when_the_only_tasks_are_deleted(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(TASKS, json={"title": "Видалена задача"})
    await client.delete(f"{TASKS}/{created.json()['id']}")

    await run_seed()

    assert (await client.get(TASKS)).json()["total"] == 0


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_reset_replaces_existing_tasks_with_a_fresh_demo_set(
    client: httpx.AsyncClient,
) -> None:
    await run_seed()
    seeded = await all_tasks(client)
    await client.post(TASKS, json={"title": "Моя власна задача"})

    await run_seed("--reset")

    reseeded = await all_tasks(client)
    assert sorted(task["title"] for task in reseeded) == sorted(task["title"] for task in seeded)
    assert {task["id"] for task in reseeded}.isdisjoint(task["id"] for task in seeded)


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_reset_seeds_a_database_whose_only_tasks_are_deleted(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(TASKS, json={"title": "Видалена задача"})
    await client.delete(f"{TASKS}/{created.json()['id']}")

    await run_seed("--reset")

    assert (await client.get(TASKS)).json()["total"] >= 25


@pytest.fixture
async def seeded(empty_tasks: None, client: httpx.AsyncClient) -> datetime:
    """Seeds the empty table; returns the time just before, to judge relative dates against."""
    started = datetime.now(UTC)
    await run_seed()
    return started


@pytest.mark.anyio
async def test_seeded_tasks_fill_more_than_one_page_at_the_default_page_size(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    body = (await client.get(TASKS)).json()

    assert body["pages"] >= 2


@pytest.mark.anyio
@pytest.mark.parametrize("status", ["todo", "in_progress", "done"])
async def test_seeded_tasks_include_every_status(
    seeded: datetime, client: httpx.AsyncClient, status: str
) -> None:
    body = (await client.get(TASKS, params={"status": status})).json()

    assert body["total"] >= 3


@pytest.mark.anyio
async def test_seeded_tasks_include_every_priority(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    tasks = await all_tasks(client)

    assert {task["priority"] for task in tasks} == {"low", "medium", "high"}


def _deadline(task: dict) -> datetime | None:
    return None if task["deadline"] is None else datetime.fromisoformat(task["deadline"])


# Each kind, judged against the time the seed started; the seeded offsets keep hours of margin.
DEADLINE_KINDS: dict[str, Callable[[dict, datetime], bool]] = {
    "overdue": lambda task, now: (
        task["status"] != "done" and _deadline(task) is not None and _deadline(task) < now
    ),
    "due within three days": lambda task, now: (
        _deadline(task) is not None and now < _deadline(task) < now + timedelta(days=3)
    ),
    "more than a week away": lambda task, now: (
        _deadline(task) is not None and _deadline(task) > now + timedelta(days=7)
    ),
    "no deadline": lambda task, now: task["deadline"] is None,
}


@pytest.mark.anyio
@pytest.mark.parametrize("kind", DEADLINE_KINDS)
async def test_seeded_tasks_include_each_kind_of_deadline(
    seeded: datetime, client: httpx.AsyncClient, kind: str
) -> None:
    tasks = await all_tasks(client)

    matching = [task["title"] for task in tasks if DEADLINE_KINDS[kind](task, seeded)]
    assert len(matching) >= 2


@pytest.mark.anyio
async def test_seeded_tasks_were_created_over_the_last_month(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    created = sorted(datetime.fromisoformat(task["created_at"]) for task in await all_tasks(client))

    assert created[0] > seeded - timedelta(days=31)
    assert created[-1] < seeded + timedelta(minutes=1)
    assert created[-1] - created[0] > timedelta(days=20)


@pytest.mark.anyio
async def test_searching_a_shared_word_finds_several_seeded_tasks(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    body = (await client.get(TASKS, params={"search": "звіт"})).json()

    assert body["total"] >= 3


@pytest.mark.anyio
async def test_some_seeded_tasks_have_no_description(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    tasks = await all_tasks(client)

    assert 1 <= [task["description"] for task in tasks].count(None) <= 2
