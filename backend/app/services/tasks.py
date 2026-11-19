import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.schemas.task import TaskCreate, TaskListQuery, TaskOrdering, TaskUpdate
from app.services.errors import TaskNotFound

logger = logging.getLogger(__name__)


async def create_task(session: AsyncSession, data: TaskCreate) -> Task:
    task = Task(**data.model_dump())
    session.add(task)
    await session.commit()
    logger.info("task_created", extra={"task_id": str(task.id)})
    return task


async def get_task(session: AsyncSession, task_id: uuid.UUID) -> Task:
    """The task with this id; raises TaskNotFound if there is none or it was deleted."""
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.deleted_at.is_(None)))
    if task is None:
        raise TaskNotFound(task_id)
    return task


# Tasks without a deadline go last both ways; created_at, then id, keep pages stable on ties.
_ORDER_BY = {
    TaskOrdering.CREATED_AT: (Task.created_at.asc(), Task.id.asc()),
    TaskOrdering.CREATED_AT_DESC: (Task.created_at.desc(), Task.id.asc()),
    TaskOrdering.DEADLINE: (Task.deadline.asc().nulls_last(), Task.created_at.asc(), Task.id.asc()),
    TaskOrdering.DEADLINE_DESC: (
        Task.deadline.desc().nulls_last(),
        Task.created_at.asc(),
        Task.id.asc(),
    ),
}


async def list_tasks(session: AsyncSession, query: TaskListQuery) -> tuple[list[Task], int]:
    """One page of the matching tasks that aren't deleted, and how many match in all."""
    matching = select(Task).where(Task.deleted_at.is_(None))
    if query.status is not None:
        matching = matching.where(Task.status == query.status)
    if query.search is not None:
        # autoescape makes %, _ and the escape character itself match literally.
        matching = matching.where(Task.title.icontains(query.search, autoescape=True))
    total = await session.scalar(select(func.count()).select_from(matching.subquery())) or 0
    # Past the end there is nothing to fetch, and a huge offset would overflow the database's int.
    if query.offset >= total:
        return [], total
    rows = await session.scalars(
        matching.order_by(*_ORDER_BY[query.ordering]).offset(query.offset).limit(query.page_size)
    )
    return list(rows), total


async def update_task(session: AsyncSession, task_id: uuid.UUID, data: TaskUpdate) -> Task:
    task = await get_task(session, task_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(task, field, value)
    task.touch()
    await session.commit()
    # Field names only: values (title, description) are user content.
    logger.info(
        "task_updated", extra={"task_id": str(task_id), "fields": ",".join(sorted(changes))}
    )
    return task


async def delete_task(session: AsyncSession, task_id: uuid.UUID) -> None:
    task = await get_task(session, task_id)
    task.mark_deleted()
    await session.commit()
    logger.info("task_deleted", extra={"task_id": str(task_id)})
