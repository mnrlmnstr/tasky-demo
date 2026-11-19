import json
import logging
import traceback
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.services.errors import TaskNotFound

logger = logging.getLogger(__name__)

INTERNAL_ERROR_DETAIL = "Internal server error"


def _traceback_without_message(exc: Exception) -> str:
    """The frames of `exc`'s traceback, without its message or the exceptions it chains.

    An exception's message (a connection error's, say) can carry the database URL with
    its password, so it never reaches the log; the type is logged separately.
    """
    return "".join(traceback.TracebackException.from_exception(exc).stack.format())


async def _task_not_found(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Task not found"})


class _AsciiJSONResponse(JSONResponse):
    """JSON with non-ASCII escaped, so a lone surrogate echoed from the input still encodes."""

    def render(self, content: Any) -> bytes:
        return json.dumps(content, separators=(",", ":")).encode("ascii")


async def _validation_failed(request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's own body, rendered so that any input it echoes can be encoded.
    return _AsciiJSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": jsonable_encoder(exc.errors())},
    )


class ResponseAborted(Exception):
    """An unhandled error struck after the response started; already logged."""


class UnhandledErrorMiddleware:
    """Turns an exception no handler took into a generic 500.

    A pure ASGI middleware rather than an `Exception` handler: Starlette re-raises after
    running such a handler, so the server would log the same traceback a second time.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":  # pragma: no cover - only uvicorn sends lifespan here
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception as exc:
            logger.error(
                "unhandled_exception",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "error_type": type(exc).__name__,
                    "traceback": _traceback_without_message(exc),
                },
            )
            if response_started:
                # Too late for a 500: raising makes the server drop the connection, so the
                # client can't take the cut-off body for a whole one. A fresh, message-less
                # error keeps the original message out of the server's own log.
                raise ResponseAborted from None
            response = JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": INTERNAL_ERROR_DETAIL},
            )
            await response(scope, receive, send)


def install_error_handling(app: FastAPI) -> None:
    """The TaskNotFound handler plus the middleware that turns any other error into a 500."""
    app.add_exception_handler(TaskNotFound, _task_not_found)
    app.add_exception_handler(RequestValidationError, _validation_failed)
    app.add_middleware(UnhandledErrorMiddleware)
