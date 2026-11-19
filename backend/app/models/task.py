import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import TaskPriority, TaskStatus


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _text_enum(enum: type[StrEnum], name: str) -> Enum:
    """A text column holding the enum's values, limited by a check constraint."""
    return Enum(
        enum,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda members: [member.value for member in members],
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TaskStatus] = mapped_column(
        _text_enum(TaskStatus, "status"), default=TaskStatus.TODO, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        _text_enum(TaskPriority, "priority"), default=TaskPriority.MEDIUM
    )
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Set on soft delete; a task with it set counts as gone.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def touch(self) -> None:
        """Mark the task as updated now, even when no other field changed value."""
        self.updated_at = _utcnow()

    def mark_deleted(self) -> None:
        self.deleted_at = _utcnow()
