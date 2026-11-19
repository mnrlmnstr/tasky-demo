from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health, openapi, tasks
from app.api.errors import install_error_handling
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
    app = FastAPI(
        title="Tasky API",
        description=openapi.description(API_PREFIX),
        version="0.1.0",
        openapi_tags=openapi.TAGS,
        lifespan=lifespan,
    )
    install_error_handling(app)
    for router in (health.router, tasks.router):
        app.include_router(router, prefix=API_PREFIX)
    openapi.install_openapi(app)
    return app


app = create_app()
