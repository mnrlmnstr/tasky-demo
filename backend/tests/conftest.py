import os
from collections.abc import Iterator

import pytest
from sqlalchemy import make_url

from app.core.config import get_settings


def _test_database_url() -> str:
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    app_url = make_url(os.environ["DATABASE_URL"])
    return app_url.set(database=f"{app_url.database}_test").render_as_string(hide_password=False)


@pytest.fixture(scope="session", autouse=True)
def test_settings() -> Iterator[None]:
    """Points the settings (read by the app's lifespan and Alembic) at the test database."""
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("DATABASE_URL", _test_database_url())
        get_settings.cache_clear()
        yield
    get_settings.cache_clear()


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"
