"""Migration 0003 gives existing tasks a position that keeps their newest-first order."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import anyio
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

pytestmark = pytest.mark.anyio


@pytest.fixture
async def at_0002(alembic_config: Config, db_engine: AsyncEngine) -> AsyncIterator[None]:
    """The schema as it was before positions; back at head, with no tasks left, afterwards."""
    await anyio.to_thread.run_sync(command.downgrade, alembic_config, "0002")
    try:
        yield
    finally:
        await anyio.to_thread.run_sync(command.upgrade, alembic_config, "head")
        async with db_engine.begin() as connection:
            await connection.execute(text("DELETE FROM tasks"))


async def _insert(engine: AsyncEngine, title: str, hours: int, task_id: uuid.UUID) -> None:
    created = T0 + timedelta(hours=hours)
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO tasks (id, title, status, priority, created_at, updated_at)"
                " VALUES (:id, :title, 'todo', 'medium', :created, :created)"
            ),
            {"id": task_id, "title": title, "created": created},
        )


@pytest.mark.usefixtures("at_0002")
async def test_upgrade_backfills_positions_in_newest_first_order(
    alembic_config: Config, db_engine: AsyncEngine
) -> None:
    await _insert(db_engine, "oldest", 0, uuid.uuid4())
    await _insert(db_engine, "newest", 5, uuid.uuid4())
    await _insert(db_engine, "tie b", 2, uuid.UUID(int=2))
    await _insert(db_engine, "tie a", 2, uuid.UUID(int=1))

    await anyio.to_thread.run_sync(command.upgrade, alembic_config, "head")

    async with db_engine.connect() as connection:
        rows = (await connection.execute(text("SELECT title, position FROM tasks"))).all()
    by_position = [title for title, _ in sorted(rows, key=lambda row: row.position)]
    assert by_position == ["newest", "tie a", "tie b", "oldest"]
    assert len({position for _, position in rows}) == 4


@pytest.mark.usefixtures("at_0002")
async def test_upgrade_makes_position_required(
    alembic_config: Config, db_engine: AsyncEngine
) -> None:
    await anyio.to_thread.run_sync(command.upgrade, alembic_config, "head")

    async with db_engine.connect() as connection:
        nullable = await connection.scalar(
            text(
                "SELECT is_nullable FROM information_schema.columns"
                " WHERE table_name = 'tasks' AND column_name = 'position'"
            )
        )
    assert nullable == "NO"
