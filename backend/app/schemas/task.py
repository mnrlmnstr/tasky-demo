import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, StringConstraints

from app.models.enums import TaskPriority, TaskStatus


def _to_utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Deadline = Annotated[AwareDatetime, AfterValidator(_to_utc)]


class TaskOrdering(StrEnum):
    """How a task list is sorted; a leading `-` means descending."""

    CREATED_AT = "created_at"
    CREATED_AT_DESC = "-created_at"
    DEADLINE = "deadline"
    DEADLINE_DESC = "-deadline"


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    deadline: Deadline | None = None


class TaskUpdate(BaseModel):
    """Only the fields sent are applied; title, status and priority can't be null."""

    model_config = ConfigDict(extra="forbid")

    # Non-nullable with a None default: leaving a field out is fine, sending null is a 422.
    title: Title = None  # type: ignore[assignment]
    description: str | None = None
    status: TaskStatus = None  # type: ignore[assignment]
    priority: TaskPriority = None  # type: ignore[assignment]
    deadline: Deadline | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    deadline: datetime | None
    created_at: datetime
    updated_at: datetime
