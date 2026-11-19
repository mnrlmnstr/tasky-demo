import json
from typing import Any

import httpx
import pytest

from app.core.database import get_session
from app.main import create_app


async def _request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    async def no_session() -> None:
        return None

    app = create_app()
    app.dependency_overrides[get_session] = no_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        return await http.request(method, url, **kwargs)


@pytest.mark.parametrize(
    ("field", "offers_null"),
    [
        ("title", False),
        ("status", False),
        ("priority", False),
        ("description", True),
        ("deadline", True),
    ],
)
def test_update_schema_offers_null_only_for_the_fields_null_clears(
    field: str, offers_null: bool
) -> None:
    schema = create_app().openapi()["components"]["schemas"]["TaskUpdate"]

    assert ('"null"' in json.dumps(schema["properties"][field])) is offers_null
    assert field not in schema.get("required", [])


@pytest.mark.anyio
@pytest.mark.parametrize("field", ["title", "status", "priority"])
async def test_update_rejects_null_for_a_field_documented_without_it(field: str) -> None:
    response = await _request(
        "PATCH", "/api/v1/tasks/3f2b8c1e-6d4a-4f7e-9a51-2c8d7e0b4a19", json={field: None}
    )

    assert response.status_code == 422
    assert [error["loc"][-1] for error in response.json()["detail"]] == [field]


@pytest.mark.anyio
@pytest.mark.parametrize("query", ["status=null", "status="])
async def test_list_rejects_a_status_filter_that_is_not_a_status(query: str) -> None:
    response = await _request("GET", f"/api/v1/tasks?{query}")

    assert response.status_code == 422
    assert [error["loc"][-1] for error in response.json()["detail"]] == ["status"]


@pytest.mark.parametrize(
    "schema", ["TaskRead", "TaskStatus", "TaskPriority", "TaskCreate", "TaskUpdate"]
)
def test_spec_names_the_schemas_the_client_types_are_generated_from(schema: str) -> None:
    spec = create_app().openapi()

    assert schema in spec["components"]["schemas"]
