"""The OpenAPI document and the interactive docs, as the app serves them."""

import tomllib
from pathlib import Path
from typing import Annotated, Any

import httpx
import pytest
from fastapi import APIRouter, Body
from pydantic import BaseModel

from app.main import create_app

BACKEND_ROOT = Path(__file__).resolve().parents[2]

pytestmark = pytest.mark.anyio


@pytest.fixture
async def openapi(client: httpx.AsyncClient) -> dict[str, Any]:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    return response.json()


async def test_api_has_title_description_and_version(openapi: dict[str, Any]) -> None:
    info = openapi["info"]

    assert info["title"] == "Tasky API"
    assert info["version"]
    assert "/api/v1" in info["description"]


async def test_api_version_is_the_package_version(openapi: dict[str, Any]) -> None:
    pyproject = tomllib.loads((BACKEND_ROOT / "pyproject.toml").read_text())

    assert openapi["info"]["version"] == pyproject["project"]["version"]


class _Note(BaseModel):
    note: str | None


async def test_a_router_included_later_keeps_its_null_body_examples() -> None:
    app = create_app()
    extra = APIRouter()

    @extra.put("/notes")
    async def put_note(
        body: Annotated[_Note, Body(openapi_examples={"clear": {"value": {"note": None}}})],
    ) -> None: ...

    app.include_router(extra, prefix="/extra")

    shown = app.openapi()["paths"]["/extra/notes"]["put"]["requestBody"]["content"]
    assert shown["application/json"]["examples"]["clear"]["value"] == {"note": None}


async def test_tasks_and_health_tags_are_described(openapi: dict[str, Any]) -> None:
    described = {tag["name"] for tag in openapi["tags"] if tag.get("description")}

    assert described == {"tasks", "health"}


ROUTES = [
    ("/api/v1/health", "get"),
    ("/api/v1/tasks", "post"),
    ("/api/v1/tasks", "get"),
    ("/api/v1/tasks/{task_id}", "get"),
    ("/api/v1/tasks/{task_id}", "patch"),
    ("/api/v1/tasks/{task_id}", "delete"),
]


async def test_routes_listed_are_all_the_routes_there_are(openapi: dict[str, Any]) -> None:
    served = sorted((path, method) for path, item in openapi["paths"].items() for method in item)

    assert served == sorted(ROUTES)


@pytest.mark.parametrize(("path", "method"), ROUTES)
async def test_every_route_has_a_summary_and_a_description(
    openapi: dict[str, Any], path: str, method: str
) -> None:
    operation = openapi["paths"][path][method]

    assert operation.get("summary")
    assert operation.get("description")


LIST_QUERY_PARAMETERS = [
    "status",
    "search",
    "deadline_from",
    "deadline_to",
    "ordering",
    "page",
    "page_size",
]


@pytest.mark.parametrize("name", LIST_QUERY_PARAMETERS)
async def test_every_list_query_parameter_has_a_description_and_an_example(
    openapi: dict[str, Any], name: str
) -> None:
    parameters = openapi["paths"]["/api/v1/tasks"]["get"]["parameters"]
    [parameter] = [p for p in parameters if p["name"] == name]

    assert parameter.get("description")
    assert parameter["schema"].get("examples")


DOCUMENTED_SCHEMAS = ["TaskCreate", "TaskUpdate", "TaskRead", "Page_TaskRead_"]


@pytest.mark.parametrize("schema", DOCUMENTED_SCHEMAS)
async def test_every_schema_field_has_a_description(openapi: dict[str, Any], schema: str) -> None:
    properties = openapi["components"]["schemas"][schema]["properties"]

    undescribed = [name for name, field in properties.items() if not field.get("description")]

    assert undescribed == []


@pytest.mark.parametrize("schema", DOCUMENTED_SCHEMAS)
async def test_every_schema_field_has_an_example(openapi: dict[str, Any], schema: str) -> None:
    properties = openapi["components"]["schemas"][schema]["properties"]

    # A page's items are tasks, whose own fields carry the examples.
    without_example = [
        name for name, field in properties.items() if not field.get("examples") and name != "items"
    ]

    assert without_example == []


def body_examples(openapi: dict[str, Any], path: str, method: str) -> list[Any]:
    content = openapi["paths"][path][method]["requestBody"]["content"]["application/json"]
    return [example["value"] for example in content.get("examples", {}).values()]


async def test_create_has_a_request_body_example(openapi: dict[str, Any]) -> None:
    examples = body_examples(openapi, "/api/v1/tasks", "post")

    assert any("title" in example for example in examples)


async def test_update_has_an_example_changing_only_the_status(openapi: dict[str, Any]) -> None:
    examples = body_examples(openapi, "/api/v1/tasks/{task_id}", "patch")

    assert any(set(example) == {"status"} for example in examples)


async def test_update_has_an_example_clearing_the_deadline(openapi: dict[str, Any]) -> None:
    examples = body_examples(openapi, "/api/v1/tasks/{task_id}", "patch")

    assert {"deadline": None} in examples


@pytest.mark.parametrize("path", ["/docs", "/redoc"])
async def test_interactive_docs_are_served(client: httpx.AsyncClient, path: str) -> None:
    response = await client.get(path)

    assert response.status_code == 200
    assert "/openapi.json" in response.text
