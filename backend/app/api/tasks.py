import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, status
from fastapi.openapi.models import Example
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

CREATE_EXAMPLES: dict[str, Example] = {
    "full": {
        "summary": "A task with every field",
        "value": {
            "title": "Prepare the quarterly report",
            "description": "Collect the numbers from finance and draft the summary.",
            "status": "todo",
            "priority": "high",
            "deadline": "2026-12-01T17:00:00Z",
        },
    },
    "minimal": {
        "summary": "Only a title",
        "value": {"title": "Call the plumber"},
    },
}

UPDATE_EXAMPLES: dict[str, Example] = {
    "change_status": {
        "summary": "Change the status",
        "value": {"status": "done"},
    },
    "clear_deadline": {
        "summary": "Clear the deadline",
        "value": {"deadline": None},
    },
    "several_fields": {
        "summary": "Change several fields",
        "value": {"title": "Prepare the annual report", "priority": "medium"},
    },
}


@router.post(
    "", status_code=status.HTTP_201_CREATED, response_model=TaskRead, summary="Create a task"
)
async def create_task(
    data: Annotated[TaskCreate, Body(openapi_examples=CREATE_EXAMPLES)], session: Session
) -> TaskRead:
    """Create a task. Only `title` is required; status defaults to `todo` and priority to
    `medium`. A `deadline` must carry a timezone and is returned in UTC."""
    task = await task_service.create_task(session, data)
    return TaskRead.model_validate(task)


@router.get("", response_model=Page[TaskRead], summary="List tasks")
async def list_tasks(query: Annotated[TaskListQuery, Query()], session: Session) -> Page[TaskRead]:
    """One page of tasks, newest first unless `ordering` says otherwise. Filter by `status`
    and search titles with `search`. Deleted tasks never appear."""
    tasks, total = await task_service.list_tasks(session, query)
    return Page[TaskRead].of(
        [TaskRead.model_validate(task) for task in tasks],
        total=total,
        page=query.page,
        page_size=query.page_size,
    )


@router.get("/{task_id}", response_model=TaskRead, responses=NOT_FOUND, summary="Get a task")
async def get_task(task_id: uuid.UUID, session: Session) -> TaskRead:
    """The task with this id. A deleted task answers `404`."""
    task = await task_service.get_task(session, task_id)
    return TaskRead.model_validate(task)


@router.patch("/{task_id}", response_model=TaskRead, responses=NOT_FOUND, summary="Update a task")
async def update_task(
    task_id: uuid.UUID,
    data: Annotated[TaskUpdate, Body(openapi_examples=UPDATE_EXAMPLES)],
    session: Session,
) -> TaskRead:
    """Change some fields of a task; fields left out keep their value. `title`, `status` and
    `priority` can't be set to null; send `null` for `description` or `deadline` to clear it.
    A deleted task answers `404`."""
    task = await task_service.update_task(session, task_id, data)
    return TaskRead.model_validate(task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Delete a task",
)
async def delete_task(task_id: uuid.UUID, session: Session) -> None:
    """Soft-delete a task: it is kept but hidden, so reading, updating or deleting it again
    answers `404`."""
    await task_service.delete_task(session, task_id)
