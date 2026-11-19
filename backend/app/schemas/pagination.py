import math
from collections.abc import Sequence

from pydantic import BaseModel


class Page[T](BaseModel):
    """One page of a list: its items plus where it sits in the whole result."""

    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def of(cls, items: Sequence[T], *, total: int, page: int, page_size: int) -> "Page[T]":
        """The page holding `items`, with the page count worked out from `total`."""
        return cls(
            items=list(items),
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size),
        )
