from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.database import get_session
from app.main import app

# Nothing listens on port 1, so every connection attempt is refused.
UNREACHABLE_DATABASE_URL = "postgresql+asyncpg://tasky:tasky@127.0.0.1:1/tasky"


@pytest.fixture
async def client_without_database() -> AsyncIterator[httpx.AsyncClient]:
    """The real app, with `get_session` pointing at a database server that is down."""
    engine = create_async_engine(UNREACHABLE_DATABASE_URL, poolclass=NullPool)

    async def _session() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _session
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
    finally:
        app.dependency_overrides.pop(get_session, None)
        await engine.dispose()


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
