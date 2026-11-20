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
    created = await client.post(TASKS, json={"title": "A deleted task"})
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
    await client.post(TASKS, json={"title": "My own task"})

    await run_seed("--reset")

    reseeded = await all_tasks(client)
    assert sorted(task["title"] for task in reseeded) == sorted(task["title"] for task in seeded)
    assert {task["id"] for task in reseeded}.isdisjoint(task["id"] for task in seeded)


@pytest.mark.anyio
@pytest.mark.usefixtures("empty_tasks")
async def test_reset_seeds_a_database_whose_only_tasks_are_deleted(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(TASKS, json={"title": "A deleted task"})
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
@pytest.mark.parametrize(
    ("status", "fewest", "most"),
    [("in_progress", 3, 5), ("todo", 6, 8), ("done", 15, 22)],
)
async def test_seeded_tasks_are_mostly_shipped_work_with_a_few_in_progress_and_next_steps(
    seeded: datetime, client: httpx.AsyncClient, status: str, fewest: int, most: int
) -> None:
    body = (await client.get(TASKS, params={"status": status})).json()

    assert fewest <= body["total"] <= most


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
async def test_seeded_done_tasks_have_no_deadline_ahead(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    done = (await client.get(TASKS, params={"status": "done", "page_size": 100})).json()["items"]

    assert all(_deadline(task) is None or _deadline(task) < seeded for task in done)


@pytest.mark.anyio
async def test_seeded_tasks_were_created_in_the_past_over_about_three_weeks(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    created = sorted(datetime.fromisoformat(task["created_at"]) for task in await all_tasks(client))

    assert created[0] > seeded - timedelta(days=22)
    assert created[-1] < seeded
    assert created[-1] - created[0] > timedelta(days=20)


@pytest.mark.anyio
async def test_seeded_shipped_work_was_created_before_the_current_work(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    tasks = await all_tasks(client)

    def created(status: str) -> list[datetime]:
        return [datetime.fromisoformat(t["created_at"]) for t in tasks if t["status"] == status]

    assert min(created("done")) < min(created("in_progress"))
    assert min(created("done")) < min(created("todo"))


@pytest.mark.anyio
async def test_searching_a_word_stem_finds_every_form_of_it_in_any_case(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    body = (await client.get(TASKS, params={"search": "фільтр", "page_size": 100})).json()

    titles = [task["title"] for task in body["items"]]
    assert body["total"] == 5
    assert any(title.startswith("Фільтри ") for title in titles)
    assert any(" фільтр " in title for title in titles)


@pytest.mark.anyio
async def test_some_seeded_tasks_have_no_description(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    tasks = await all_tasks(client)

    assert 2 <= [task["description"] for task in tasks].count(None) <= 6


@pytest.mark.anyio
async def test_seeded_titles_are_distinct(seeded: datetime, client: httpx.AsyncClient) -> None:
    titles = [task["title"] for task in await all_tasks(client)]

    assert len(set(titles)) == len(titles)


PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}
BOARD_COLUMNS = ["in_progress", "todo", "done"]


@pytest.mark.anyio
async def test_seeded_custom_order_puts_current_work_first_by_importance(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    params = {"ordering": "position", "page_size": 100}
    by_position = (await client.get(TASKS, params=params)).json()["items"]
    statuses = [task["status"] for task in by_position]

    assert len({task["position"] for task in by_position}) == len(by_position)
    assert statuses == sorted(statuses, key=BOARD_COLUMNS.index)
    for status in ("in_progress", "todo"):
        ranks = [PRIORITY_RANK[t["priority"]] for t in by_position if t["status"] == status]
        assert ranks == sorted(ranks)


@pytest.mark.anyio
async def test_seeded_done_column_shows_the_latest_shipped_work_first(
    seeded: datetime, client: httpx.AsyncClient
) -> None:
    params = {"ordering": "position", "status": "done", "page_size": 100}
    by_position = (await client.get(TASKS, params=params)).json()["items"]
    newest_first = (await client.get(TASKS, params={"status": "done", "page_size": 100})).json()

    assert [task["id"] for task in by_position] == [task["id"] for task in newest_first["items"]]
