from pydantic import BaseModel


class ErrorDetail(BaseModel):
    """The body of a 404 or 500 response."""

    detail: str
