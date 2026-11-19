from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health, tasks
from app.api.errors import register_exception_handlers
from app.core.config import get_settings
from app.core.database import create_engine, create_session_factory
from app.core.logging import configure_logging

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings)
    engine = create_engine(settings)
    app.state.session_factory = create_session_factory(engine)
    try:
        yield
    finally:
        await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="Tasky API", lifespan=lifespan)
    register_exception_handlers(app)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(tasks.router, prefix=API_PREFIX)
    return app


app = create_app()
