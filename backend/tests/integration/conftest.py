"""Integration fixtures on a real PostgreSQL test database.

The `test_settings` fixture in tests/conftest.py points the settings at
`<app database>_test` on the same server (or at TEST_DATABASE_URL when set).
The database is created on first use and kept.
"""

from collections.abc import AsyncIterator
from pathlib import Path

import anyio
import httpx
import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, inspect, make_url, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.database import get_session
from app.main import create_app
from tests.asgi import app_client

BACKEND_ROOT = Path(__file__).resolve().parents[2]


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
async def test_database_url(test_settings: None) -> str:
    url = get_settings().database_url
    await _create_database_if_missing(url)
    return url


def _alembic_config() -> Config:
    return Config(str(BACKEND_ROOT / "alembic.ini"))


def _version_table_and_revision(sync: Connection) -> tuple[bool, str | None]:
    migration = MigrationContext.configure(sync)
    has_table = inspect(sync).has_table(migration.version_table)
    return has_table, migration.get_current_revision()


@pytest.fixture(scope="session")
async def migrated_database(test_database_url: str) -> AsyncIterator[str]:
    """The test database at `alembic upgrade head`, returned exactly to its prior state afterwards.

    Alembic's async env.py runs its own event loop, so its commands run in a worker thread.
    """
    config = _alembic_config()
    engine = create_async_engine(test_database_url, poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            had_version_table, found_at = await connection.run_sync(_version_table_and_revision)
        await anyio.to_thread.run_sync(command.upgrade, config, "head")
        yield test_database_url
        await anyio.to_thread.run_sync(command.downgrade, config, found_at or "base")
        if not had_version_table:
            async with engine.begin() as connection:
                await connection.execute(text("DROP TABLE alembic_version"))
    finally:
        await engine.dispose()


@pytest.fixture
def alembic_config(migrated_database: str) -> Config:
    return _alembic_config()


@pytest.fixture
async def db_engine(migrated_database: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(migrated_database, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """An AsyncSession whose commits become savepoints inside a transaction rolled back after."""
    async with db_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest.fixture
async def client(migrated_database: str) -> AsyncIterator[httpx.AsyncClient]:
    """The real app over ASGI; its lifespan builds the engine from the test settings."""
    async with app_client(create_app()) as http:
        yield http


@pytest.fixture
async def rollback_client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    """The real app, with every request using `db_session`, so its writes are rolled back."""

    async def _session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app = create_app()
    app.dependency_overrides[get_session] = _session
    async with app_client(app) as http:
        yield http
