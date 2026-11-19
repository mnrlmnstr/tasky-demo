import logging
import traceback

from fastapi import FastAPI, Request, status
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
            if not response_started:
                response = JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={"detail": INTERNAL_ERROR_DETAIL},
                )
                await response(scope, receive, send)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(TaskNotFound, _task_not_found)
    app.add_middleware(UnhandledErrorMiddleware)
