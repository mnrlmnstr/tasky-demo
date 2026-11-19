import os

import pytest
from sqlalchemy import make_url


def _test_database_url() -> str:
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    app_url = make_url(os.environ["DATABASE_URL"])
    return app_url.set(database=f"{app_url.database}_test").render_as_string(hide_password=False)


# Runs before any test module imports the app, so the app's settings, engine and
# `get_session` all target the test database, never the app database.
os.environ["DATABASE_URL"] = _test_database_url()


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"
