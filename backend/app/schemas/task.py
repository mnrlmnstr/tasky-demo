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
    ValidationInfo,
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
# Strict: a JSON number only, never a numeric string or a boolean.
Position = Annotated[float, Field(strict=True, allow_inf_nan=False)]


def _without_null(schema: dict[str, Any]) -> None:
    """Documents an optional field as its non-null type: null is never accepted, so not offered."""
    [kept] = [variant for variant in schema.pop("anyOf") if variant != {"type": "null"}]
    schema.update(kept)
    if "$ref" in kept:
        # A reference stands alone, as it would for a field typed without the None.
        schema.pop("title", None)


class TaskOrdering(StrEnum):
    """How a task list is sorted; a leading `-` means descending."""

    CREATED_AT = "created_at"
    CREATED_AT_DESC = "-created_at"
    DEADLINE = "deadline"
    DEADLINE_DESC = "-deadline"
    POSITION = "position"


class TaskListQuery(BaseModel):
    """What a task list asks for: filters, order and which page."""

    # A query string has no null: leaving a filter out is the only way not to filter.
    status: TaskStatus | None = Field(
        default=None,
        description="Only tasks with this status.",
        examples=["in_progress"],
        json_schema_extra=_without_null,
    )
    search: Text | None = Field(
        default=None,
        description="Only tasks whose title contains this text, ignoring case.",
        examples=["фільтр"],
        json_schema_extra=_without_null,
    )
    deadline_from: Deadline | None = Field(
        default=None,
        description=(
            "Only tasks due at or after this instant (inclusive), with a timezone. "
            "Tasks without a deadline are left out while either bound is set."
        ),
        examples=["2026-11-19T22:00:00Z"],
        json_schema_extra=_without_null,
    )
    deadline_to: Deadline | None = Field(
        default=None,
        description=(
            "Only tasks due before this instant (exclusive), with a timezone; "
            "must not be before `deadline_from`."
        ),
        examples=["2026-11-20T22:00:00Z"],
        json_schema_extra=_without_null,
    )
    ordering: TaskOrdering = Field(
        default=TaskOrdering.CREATED_AT_DESC,
        description=(
            "Sort by `created_at` or `deadline`; a leading `-` sorts descending. "
            "Tasks without a deadline come last either way. `position` is the custom order: "
            "ascending `position`, ties newest first."
        ),
        examples=["deadline"],
    )
    page: int = Field(default=1, ge=1, description="Which page to return, from 1.", examples=[1])
    page_size: int = Field(
        default=20, ge=1, le=100, description="How many tasks per page (1 to 100).", examples=[20]
    )

    # A field validator, not a model one, so the error points at `deadline_to`.
    @field_validator("deadline_to")
    @classmethod
    def _not_before_from(cls, value: datetime | None, info: ValidationInfo) -> datetime | None:
        start = info.data.get("deadline_from")
        if value is not None and start is not None and start > value:
            raise ValueError("must not be before deadline_from")
        return value

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


_TITLE = "What the task is, 1 to 200 characters; surrounding whitespace is trimmed."
_DESCRIPTION = "Free-text details."
_STATUS = "Where the task stands."
_PRIORITY = "How urgent the task is."
_DEADLINE = "When the task is due, with a timezone; returned in UTC."

_TITLE_EXAMPLE = "Prepare the quarterly report"
_DESCRIPTION_EXAMPLE = "Collect the numbers from finance and draft the summary."
_DEADLINE_EXAMPLE = "2026-12-01T17:00:00Z"
_POSITION = (
    "Place in the custom order (`ordering=position`): lower comes first. To move a task "
    "between two others, send a number between theirs, such as their midpoint."
)


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title = Field(description=_TITLE, examples=[_TITLE_EXAMPLE])
    description: Text | None = Field(
        default=None, description=_DESCRIPTION, examples=[_DESCRIPTION_EXAMPLE]
    )
    status: TaskStatus = Field(default=TaskStatus.TODO, description=_STATUS, examples=["todo"])
    priority: TaskPriority = Field(
        default=TaskPriority.MEDIUM, description=_PRIORITY, examples=["high"]
    )
    deadline: Deadline | None = Field(
        default=None, description=_DEADLINE, examples=[_DEADLINE_EXAMPLE]
    )


class TaskUpdate(BaseModel):
    """Only the fields sent are applied; title, status, priority and position can't be null."""

    model_config = ConfigDict(extra="forbid")

    # Optional so they can be left out; null is rejected below and kept out of the schema.
    title: Title | None = Field(
        default=None,
        description=_TITLE,
        examples=[_TITLE_EXAMPLE],
        json_schema_extra=_without_null,
    )
    description: Text | None = Field(
        default=None,
        description=f"{_DESCRIPTION} Send `null` to clear it.",
        examples=[_DESCRIPTION_EXAMPLE],
    )
    status: TaskStatus | None = Field(
        default=None, description=_STATUS, examples=["done"], json_schema_extra=_without_null
    )
    priority: TaskPriority | None = Field(
        default=None, description=_PRIORITY, examples=["low"], json_schema_extra=_without_null
    )
    deadline: Deadline | None = Field(
        default=None,
        description=f"{_DEADLINE} Send `null` to clear it.",
        examples=[_DEADLINE_EXAMPLE],
    )
    position: Position | None = Field(
        default=None,
        description=f"{_POSITION} Any finite number.",
        examples=[1.5],
        json_schema_extra=_without_null,
    )

    # Runs only on values that were sent (defaults aren't validated), so omitting is fine.
    @field_validator("title", "status", "priority", "position")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("must not be null")
        return value


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(
        description="The task's id.", examples=["3f2b8c1e-6d4a-4f7e-9a51-2c8d7e0b4a19"]
    )
    title: str = Field(description="What the task is.", examples=[_TITLE_EXAMPLE])
    description: str | None = Field(description=_DESCRIPTION, examples=[_DESCRIPTION_EXAMPLE])
    status: TaskStatus = Field(description=_STATUS, examples=["in_progress"])
    priority: TaskPriority = Field(description=_PRIORITY, examples=["medium"])
    deadline: datetime | None = Field(
        description="When the task is due, in UTC.", examples=[_DEADLINE_EXAMPLE]
    )
    position: float = Field(description=_POSITION, examples=[2.0])
    created_at: datetime = Field(
        description="When the task was created, in UTC.", examples=["2026-11-02T09:30:00Z"]
    )
    updated_at: datetime = Field(
        description="When the task last changed, in UTC.", examples=["2026-11-03T14:05:00Z"]
    )
