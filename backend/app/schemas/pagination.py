from pydantic import BaseModel  # pragma: no cover - module unused until the task list endpoint


class Page[T](BaseModel):  # pragma: no cover - nothing serves it yet; the task list endpoint will
    """One page of a list: its items plus where it sits in the whole result."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
