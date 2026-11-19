"""Integration fixtures on a real PostgreSQL test database.

tests/conftest.py points DATABASE_URL at `<app database>_test` on the same server
(or at TEST_DATABASE_URL when set). The database is created on first use and kept.
"""

from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.main import app


async def _create_database_if_missing(url: str) -> None:
    target = make_url(url)
    admin = create_async_engine(
        target.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    try:
        async with admin.connect() as connection:
            exists = await connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": target.database},
            )
            if not exists:
                await connection.execute(text(f'CREATE DATABASE "{target.database}"'))
    finally:
        await admin.dispose()


@pytest.fixture(scope="session")
async def test_database_url() -> str:
    url = get_settings().database_url
    await _create_database_if_missing(url)
    return url


@pytest.fixture
async def client(test_database_url: str) -> AsyncIterator[httpx.AsyncClient]:
    """The real app over ASGI, with its own engine and `get_session` on the test database."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
