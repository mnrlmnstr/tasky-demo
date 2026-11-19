"""The `tasks` table as created by `alembic upgrade head`, used through an AsyncSession."""

import uuid
from datetime import timedelta

import anyio
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.enums import TaskPriority, TaskStatus
from app.models.task import Task


@pytest.mark.anyio
async def test_saved_task_gets_an_app_generated_uuid4(db_session: AsyncSession) -> None:
    task = Task(title="Write the report")

    db_session.add(task)
    await db_session.commit()

    assert isinstance(task.id, uuid.UUID)
    assert task.id.version == 4


@pytest.mark.anyio
async def test_saved_task_defaults_to_todo_and_medium(db_session: AsyncSession) -> None:
    task = Task(title="Write the report")

    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    assert task.status is TaskStatus.TODO
    assert task.priority is TaskPriority.MEDIUM


@pytest.mark.anyio
async def test_saved_task_keeps_given_status_and_priority(db_session: AsyncSession) -> None:
    task = Task(title="Ship it", status=TaskStatus.IN_PROGRESS, priority=TaskPriority.HIGH)

    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    assert task.status is TaskStatus.IN_PROGRESS
    assert task.priority is TaskPriority.HIGH


@pytest.mark.anyio
async def test_saved_task_timestamps_are_timezone_aware_utc(db_session: AsyncSession) -> None:
    task = Task(title="Write the report")

    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    assert task.created_at.utcoffset() == timedelta(0)
    assert task.updated_at.utcoffset() == timedelta(0)


@pytest.mark.anyio
async def test_updating_a_task_refreshes_updated_at_but_not_created_at(
    db_session: AsyncSession,
) -> None:
    task = Task(title="Write the report")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    created_at, updated_at = task.created_at, task.updated_at

    task.title = "Write the final report"
    await db_session.commit()
    await db_session.refresh(task)

    assert task.created_at == created_at
    assert task.updated_at > updated_at


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("column", "value"),
    [("status", "archived"), ("priority", "urgent")],
)
async def test_database_rejects_unknown_status_or_priority(
    db_session: AsyncSession, column: str, value: str
) -> None:
    statement = insert(Task).values(title="Write the report", **{column: value})

    with pytest.raises(IntegrityError, match=f'"ck_tasks_{column}"'):
        await db_session.execute(statement)


@pytest.mark.anyio
async def test_downgrade_base_then_upgrade_head_recreates_a_working_table(
    alembic_config: Config, db_engine: AsyncEngine
) -> None:
    await anyio.to_thread.run_sync(command.downgrade, alembic_config, "base")
    async with AsyncSession(db_engine) as session:
        with pytest.raises(ProgrammingError, match="tasks"):
            await session.execute(select(Task))

    await anyio.to_thread.run_sync(command.upgrade, alembic_config, "head")

    async with AsyncSession(db_engine) as session:
        session.add(Task(title="Write the report"))
        await session.flush()
        titles = await session.scalars(select(Task.title))
        assert titles.all() == ["Write the report"]
        await session.rollback()
