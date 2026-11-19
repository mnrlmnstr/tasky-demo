import math
from collections.abc import Sequence

from pydantic import BaseModel, Field


class Page[T](BaseModel):
    """One page of a list: its items plus where it sits in the whole result."""

    items: list[T] = Field(description="The items on this page.")
    total: int = Field(description="How many items match, across all pages.", examples=[42])
    page: int = Field(description="This page's number, from 1.", examples=[1])
    page_size: int = Field(description="The most items a page holds.", examples=[20])
    pages: int = Field(description="How many pages there are in all.", examples=[3])

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
