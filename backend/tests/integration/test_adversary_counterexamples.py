"""Counterexamples against issue #2, through the public interfaces."""

import pytest

from tests.asgi import app_client


# Spec #2: "App factory with `/api/v1` router prefix"
@pytest.mark.anyio
async def test_app_factory_builds_an_app_with_the_api_prefix(test_database_url: str) -> None:
    from app import main

    factory = getattr(main, "create_app", None)
    assert callable(factory), "app.main has no app factory (create_app)"
    async with app_client(factory()) as http:
        response = await http.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
