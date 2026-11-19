import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import INTERNAL_ERROR
from app.core.database import get_session
from app.schemas.errors import ErrorDetail
from app.schemas.pagination import Page
from app.schemas.task import TaskCreate, TaskListQuery, TaskRead, TaskUpdate
from app.services import tasks as task_service

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"model": ErrorDetail, "description": "Task not found"}
}

router = APIRouter(prefix="/tasks", tags=["tasks"], responses=INTERNAL_ERROR)

Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TaskRead)
async def create_task(data: TaskCreate, session: Session) -> TaskRead:
    task = await task_service.create_task(session, data)
    return TaskRead.model_validate(task)


@router.get("", response_model=Page[TaskRead])
async def list_tasks(query: Annotated[TaskListQuery, Query()], session: Session) -> Page[TaskRead]:
    tasks, total = await task_service.list_tasks(session, query)
    return Page[TaskRead].of(
        [TaskRead.model_validate(task) for task in tasks],
        total=total,
        page=query.page,
        page_size=query.page_size,
    )


@router.get("/{task_id}", response_model=TaskRead, responses=NOT_FOUND)
async def get_task(task_id: uuid.UUID, session: Session) -> TaskRead:
    task = await task_service.get_task(session, task_id)
    return TaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=TaskRead, responses=NOT_FOUND)
async def update_task(task_id: uuid.UUID, data: TaskUpdate, session: Session) -> TaskRead:
    task = await task_service.update_task(session, task_id, data)
    return TaskRead.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
async def delete_task(task_id: uuid.UUID, session: Session) -> None:
    await task_service.delete_task(session, task_id)
