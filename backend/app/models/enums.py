"""Task vocabulary shared by the ORM model and the API schemas.

Plain Python only: the schemas import this without pulling in SQLAlchemy.
"""

from enum import StrEnum


class TaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class TaskPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
