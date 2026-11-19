import re
import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.models.enums import TaskPriority, TaskStatus

# PostgreSQL text can't hold NUL, and a lone surrogate has no UTF-8 encoding.
_UNSTORABLE = re.compile("[\x00\ud800-\udfff]")


def _storable(value: str) -> str:
    if _UNSTORABLE.search(value):
        raise ValueError("must not contain NUL characters or unpaired surrogates")
    return value


def _to_utc(value: datetime) -> datetime:
    # Validators must raise ValueError: anything else escapes validation as a 500.
    try:
        return value.astimezone(UTC)
    except OverflowError:
        raise ValueError("must be within the representable range in UTC") from None


Text = Annotated[str, AfterValidator(_storable)]
Title = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    AfterValidator(_storable),
]
Deadline = Annotated[AwareDatetime, AfterValidator(_to_utc)]


class TaskOrdering(StrEnum):
    """How a task list is sorted; a leading `-` means descending."""

    CREATED_AT = "created_at"
    CREATED_AT_DESC = "-created_at"
    DEADLINE = "deadline"
    DEADLINE_DESC = "-deadline"


class TaskListQuery(BaseModel):
    """What a task list asks for: filters, order and which page."""

    status: TaskStatus | None = None
    search: Text | None = None
    ordering: TaskOrdering = TaskOrdering.CREATED_AT_DESC
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Text | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    deadline: Deadline | None = None


def _without_null(schema: dict[str, Any]) -> None:
    """Documents an optional field as its non-null type: null is a 422, so don't offer it."""
    [kept] = [variant for variant in schema.pop("anyOf") if variant != {"type": "null"}]
    schema.update(kept)
    if "$ref" in kept:
        # A reference stands alone, as it would for a field typed without the None.
        schema.pop("title", None)


class TaskUpdate(BaseModel):
    """Only the fields sent are applied; title, status and priority can't be null."""

    model_config = ConfigDict(extra="forbid")

    # Optional so they can be left out; null is rejected below and kept out of the schema.
    title: Title | None = Field(default=None, json_schema_extra=_without_null)
    description: Text | None = None
    status: TaskStatus | None = Field(default=None, json_schema_extra=_without_null)
    priority: TaskPriority | None = Field(default=None, json_schema_extra=_without_null)
    deadline: Deadline | None = None

    # Runs only on values that were sent (defaults aren't validated), so omitting is fine.
    @field_validator("title", "status", "priority")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("must not be null")
        return value


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
