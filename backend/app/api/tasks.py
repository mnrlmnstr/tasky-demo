import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.enums import TaskStatus
from app.schemas.pagination import Page
from app.schemas.task import TaskCreate, TaskOrdering, TaskRead, TaskUpdate
from app.services import tasks as task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TaskRead)
async def create_task(data: TaskCreate, session: Session) -> TaskRead:
    task = await task_service.create_task(session, data)
    return TaskRead.model_validate(task)


@router.get("", response_model=Page[TaskRead])
async def list_tasks(
    session: Session,
    status: TaskStatus | None = None,
    search: str | None = None,
    ordering: TaskOrdering = TaskOrdering.CREATED_AT_DESC,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[TaskRead]:
    tasks, total = await task_service.list_tasks(
        session,
        status=status,
        search=search,
        ordering=ordering,
        page=page,
        page_size=page_size,
    )
    return Page[TaskRead](
        items=[TaskRead.model_validate(task) for task in tasks],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size),
    )


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: uuid.UUID, session: Session) -> TaskRead:
    task = await task_service.get_task(session, task_id)
    return TaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(task_id: uuid.UUID, data: TaskUpdate, session: Session) -> TaskRead:
    task = await task_service.update_task(session, task_id, data)
    return TaskRead.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: uuid.UUID, session: Session) -> None:
    await task_service.delete_task(session, task_id)
