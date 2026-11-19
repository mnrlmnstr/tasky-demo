from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health, openapi, tasks
from app.api.errors import install_error_handling
from app.core.config import get_settings
from app.core.database import create_engine, create_session_factory
from app.core.logging import configure_logging

API_PREFIX = "/api/v1"
ROUTERS = (health.router, tasks.router)


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
        version="1.0.0",
        openapi_tags=openapi.TAGS,
        lifespan=lifespan,
    )
    install_error_handling(app)
    for router in ROUTERS:
        app.include_router(router, prefix=API_PREFIX)
    openapi.install_openapi(app, API_PREFIX, ROUTERS)
    return app


app = create_app()
