from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.services.errors import TaskNotFound


async def _task_not_found(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Task not found"})


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(TaskNotFound, _task_not_found)
