import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.errors import TaskNotFound


async def create_task(session: AsyncSession, data: TaskCreate) -> Task:
    task = Task(**data.model_dump())
    session.add(task)
    await session.commit()
    return task


async def get_task(session: AsyncSession, task_id: uuid.UUID) -> Task:
    """The task with this id; raises TaskNotFound if there is none or it was deleted."""
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.deleted_at.is_(None)))
    if task is None:
        raise TaskNotFound(task_id)
    return task


async def update_task(session: AsyncSession, task_id: uuid.UUID, data: TaskUpdate) -> Task:
    task = await get_task(session, task_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    task.touch()
    await session.commit()
    return task


async def delete_task(session: AsyncSession, task_id: uuid.UUID) -> None:
    task = await get_task(session, task_id)
    task.mark_deleted()
    await session.commit()
