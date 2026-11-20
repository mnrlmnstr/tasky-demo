"""add tasks.position for the custom order

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("position", sa.Double(), nullable=True))
    # Existing tasks keep the order they were shown in: newest first, ties by id.
    op.execute(
        """
        UPDATE tasks
        SET position = ranked.place
        FROM (
            SELECT id, row_number() OVER (ORDER BY created_at DESC, id ASC) - 1 AS place
            FROM tasks
        ) AS ranked
        WHERE tasks.id = ranked.id
        """
    )
    op.alter_column("tasks", "position", nullable=False)
    op.create_index(op.f("ix_tasks_position"), "tasks", ["position"])


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_position"), table_name="tasks")
    op.drop_column("tasks", "position")
