from pydantic import BaseModel


class Page[T](BaseModel):
    """One page of a list: its items plus where it sits in the whole result."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
