"""Demo tasks for a fresh install: the story of building Tasky itself.

The shipped work of the backend and frontend milestones is done, the current work is in
progress and a few plausible next steps are to do. Deadlines are overdue, due within a few
days, further out or missing; creation dates follow the order the work happened over the last
three weeks. Five titles share the word "board" so a search finds more than one. All dates are
relative to the seed time.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TaskPriority, TaskStatus
from app.models.task import Task

logger = logging.getLogger(__name__)

TODO, IN_PROGRESS, DONE = TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE
LOW, MEDIUM, HIGH = TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH


@dataclass(frozen=True)
class DemoTask:
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    created_ago: timedelta
    # From the seed time; negative is overdue, None means no deadline.
    deadline_in: timedelta | None


def _days(days: float) -> timedelta:
    return timedelta(days=days)


# In board order, which is also the custom order: the work in progress, then the next steps,
# each by importance, then the shipped work, latest first. One task per block, its status,
# priority, age and deadline on one line, so the mix reads at a glance.
# fmt: off
DEMO_TASKS: tuple[DemoTask, ...] = (
    # In progress
    DemoTask(
        "Refactor: shared task title and deadline pieces",
        "Pull the title, deadline badge, form submit and task actions out of the list, board "
        "and table components, so the three views stop drifting apart.",
        IN_PROGRESS, HIGH, _days(6.6), _days(1.5),
    ),
    DemoTask(
        "Demo data that tells the story of building Tasky",
        "Replace the placeholder seed with the project's own work items, so a fresh install "
        "reads like a real board.",
        IN_PROGRESS, HIGH, _days(0.2), _days(2),
    ),
    DemoTask(
        "README: quick start first",
        "Clone and one command at the top; configuration, development and the API reference "
        "below it.",
        IN_PROGRESS, MEDIUM, _days(1.6), _days(-0.3),
    ),
    DemoTask(
        "Refresh the README screenshots",
        None,
        IN_PROGRESS, LOW, _days(0.4), None,
    ),
    # To do
    DemoTask(
        "CI: frontend check and backend tests on every pull request",
        "GitHub Actions running `npm run check` and the backend suite against PostgreSQL, "
        "required before merge.",
        TODO, HIGH, _days(8.1), _days(-2),
    ),
    DemoTask(
        "Request id shared by browser and backend logs",
        "Send an X-Request-ID from the client and log it on both sides, so one failed save "
        "can be followed end to end.",
        TODO, HIGH, _days(2.8), _days(2.5),
    ),
    DemoTask(
        "Rebalance positions when custom order gaps run out",
        "Dragging between the same two tasks halves the gap each time; renumber the column "
        "before floats lose precision.",
        TODO, MEDIUM, _days(5.2), _days(-1),
    ),
    DemoTask(
        "Audit the test-only dependencies",
        "Check what the frontend and backend dev dependencies pull in and drop what the "
        "suites no longer use.",
        TODO, MEDIUM, _days(2.1), _days(8),
    ),
    DemoTask(
        "End-to-end tests in a real browser",
        "A few Playwright runs against the Compose stack: create, edit, filter and drag a task.",
        TODO, MEDIUM, _days(3.9), _days(14),
    ),
    DemoTask(
        "Shortcut keys for new task, search and undo",
        "N opens the form, / focuses the search, Ctrl+Z undoes the last change.",
        TODO, LOW, _days(1.1), None,
    ),
    DemoTask(
        "Change the status of several tasks at once",
        None,
        TODO, LOW, _days(0.7), _days(30),
    ),
    # Done, latest first
    DemoTask(
        "Fix board placeholders staying after a column loads",
        "The loading cards sat inside the cards' transition group, and their pulse animation "
        "kept the leave transition from ever finishing.",
        DONE, MEDIUM, _days(3.4), None,
    ),
    DemoTask(
        "Change priority from the list, board and table",
        "A priority menu on every task, in all three views.",
        DONE, LOW, _days(4.6), None,
    ),
    DemoTask(
        "Custom order: drag cards on the board and rows in the table",
        "A position per task, a move endpoint that places a task between two others, and "
        "Move up / Move down for the keyboard.",
        DONE, HIGH, _days(5.8), _days(-4),
    ),
    DemoTask(
        "Review fixes: deadline filter, board and accessibility",
        "Fixes from a review pass over the deadline filter, the board, the form and keyboard "
        "and screen reader use.",
        DONE, MEDIUM, _days(7.4), _days(-5),
    ),
    DemoTask(
        "Task views: list, kanban board and table",
        "Three views of the same filtered tasks, with density and description settings.",
        DONE, HIGH, _days(8.7), _days(-6),
    ),
    DemoTask(
        "Filter tasks by deadline: exact day or range",
        "A date picker for one day or a range, sent as deadline_from and deadline_to.",
        DONE, MEDIUM, _days(9.6), _days(-7),
    ),
    DemoTask(
        "Delete a task and change its status from the row",
        None,
        DONE, MEDIUM, _days(11.4), _days(-9),
    ),
    DemoTask(
        "Create and edit form with an undo toast",
        "One dialog for both, validated like the API; every create, edit and status change can "
        "be undone for a few seconds.",
        DONE, HIGH, _days(12.2), _days(-9),
    ),
    DemoTask(
        "Search, status filter and sorting toolbar",
        "Search waits for a pause in typing; the whole view lives in the address, so a reload "
        "shows the same tasks.",
        DONE, HIGH, _days(13.1), _days(-10),
    ),
    DemoTask(
        "Settings: theme, tasks per page, Ukrainian and English",
        "Kept in local storage, applied without a reload.",
        DONE, MEDIUM, _days(13.9), _days(-11),
    ),
    DemoTask(
        "Task list with pagination",
        "Twenty tasks a page by default, with the page kept in the address.",
        DONE, HIGH, _days(14.6), _days(-12),
    ),
    DemoTask(
        "Frontend foundation: generated API client, design tokens and app shell",
        "orval builds the client from the exported spec; Tailwind tokens and reka-ui give the "
        "light and dark themes.",
        DONE, HIGH, _days(15.4), _days(-13),
    ),
    DemoTask(
        "Demo data seed for a fresh install",
        None,
        DONE, LOW, _days(16.5), None,
    ),
    DemoTask(
        "Backend test suite with 100% coverage",
        "Integration tests against a real PostgreSQL; the run fails if coverage drops.",
        DONE, MEDIUM, _days(17.2), _days(-15),
    ),
    DemoTask(
        "OpenAPI docs with request and response examples",
        "Every endpoint, parameter and error described in Swagger UI and ReDoc, and the spec "
        "exported for the client.",
        DONE, MEDIUM, _days(17.8), _days(-15),
    ),
    DemoTask(
        "Task list filters: status, title search, sorting and pagination",
        "Search is case-insensitive and treats % and _ literally; deleted tasks never appear.",
        DONE, HIGH, _days(19.3), _days(-17),
    ),
    DemoTask(
        "Tasks API: schemas, validation and CRUD with soft delete",
        "Pydantic models for create, update and read, consistent error responses, and deleted "
        "tasks kept with a timestamp.",
        DONE, HIGH, _days(20.1), _days(-18),
    ),
    DemoTask(
        "FastAPI app skeleton and database layer",
        "Settings from the environment, a health endpoint, async SQLAlchemy with Alembic and "
        "the first Task migration.",
        DONE, HIGH, _days(21.0), _days(-19),
    ),
    DemoTask(
        "Docker Compose setup: database, backend and frontend in one command",
        "PostgreSQL, the API and the web app start with `docker compose up`; health checks "
        "decide the start order.",
        DONE, HIGH, _days(21.6), _days(-20.5),
    ),
)
# fmt: on


def _build(demo: DemoTask, now: datetime, position: float) -> Task:
    created_at = now - demo.created_ago
    return Task(
        position=position,
        title=demo.title,
        description=demo.description,
        status=demo.status,
        priority=demo.priority,
        deadline=None if demo.deadline_in is None else now + demo.deadline_in,
        created_at=created_at,
        updated_at=created_at,
    )


async def seed_demo_tasks(session: AsyncSession, now: datetime, *, reset: bool = False) -> int:
    """Add the demo tasks if the table has no rows at all; returns how many were added.

    Deleted tasks count as rows: a database someone has used is never seeded again.
    With `reset`, every row (deleted ones too) is removed first, in the same transaction.
    """
    if reset:
        await session.execute(delete(Task))
        logger.info("demo_seed_reset")
    elif await session.scalar(select(exists().select_from(Task))):
        logger.info("demo_seed_skipped", extra={"reason": "tasks_exist"})
        return 0
    session.add_all([_build(demo, now, place) for place, demo in enumerate(DEMO_TASKS)])
    await session.commit()
    logger.info("demo_seed_created", extra={"count": len(DEMO_TASKS)})
    return len(DEMO_TASKS)
