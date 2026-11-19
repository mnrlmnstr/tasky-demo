import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.database import get_session
from app.main import create_app
from app.services import health
from tests.asgi import app_client

# Nothing listens on port 1, so every connection attempt is refused.
UNREACHABLE_DATABASE_URL = "postgresql+asyncpg://tasky:tasky@127.0.0.1:1/tasky"


@pytest.fixture
async def client_without_database() -> AsyncIterator[httpx.AsyncClient]:
    """The real app, with `get_session` pointing at a database server that is down."""
    engine = create_async_engine(UNREACHABLE_DATABASE_URL, poolclass=NullPool)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _session
    try:
        async with app_client(app) as http:
            yield http
    finally:
        await engine.dispose()


class _HangingSession:
    """Stands in for a session whose database never answers."""

    async def execute(self, *args: Any, **kwargs: Any) -> None:
        await asyncio.sleep(60)


@pytest.fixture
async def client_with_hanging_database(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[httpx.AsyncClient]:
    monkeypatch.setattr(health, "DATABASE_CHECK_TIMEOUT_SECONDS", 0.05)

    async def _session() -> AsyncIterator[_HangingSession]:
        yield _HangingSession()

    app = create_app()
    app.dependency_overrides[get_session] = _session
    async with app_client(app) as http:
        yield http


@pytest.mark.anyio
async def test_health_reports_ok_when_database_is_reachable(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_health_reports_unavailable_when_database_is_unreachable(
    client_without_database: httpx.AsyncClient,
) -> None:
    response = await client_without_database.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


@pytest.mark.anyio
async def test_health_logs_unreachable_database(
    client_without_database: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="app.services.health"):
        await client_without_database.get("/api/v1/health")

    [record] = [r for r in caplog.records if r.getMessage() == "database_unreachable"]
    assert record.levelno == logging.WARNING
    assert record.error_type == "ConnectionRefusedError"


@pytest.mark.anyio
async def test_health_reports_unavailable_when_database_does_not_answer_in_time(
    client_with_hanging_database: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="app.services.health"):
        async with asyncio.timeout(5):
            response = await client_with_hanging_database.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    [record] = [r for r in caplog.records if r.getMessage() == "database_unreachable"]
    assert record.error_type == "TimeoutError"


def test_creating_the_app_builds_no_engine() -> None:
    app = create_app()

    assert not hasattr(app.state, "session_factory")
