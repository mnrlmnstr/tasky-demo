import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.core.database import get_session
from app.main import create_app
from app.schemas.task import TaskListQuery
from app.services import tasks as task_service
from scripts.export_openapi import DEFAULT_OUTPUT, export_openapi, render_spec


@pytest.mark.parametrize(
    ("method", "path", "operation_id"),
    [
        ("get", "/api/v1/tasks", "listTasks"),
        ("post", "/api/v1/tasks", "createTask"),
        ("get", "/api/v1/tasks/{task_id}", "getTask"),
        ("patch", "/api/v1/tasks/{task_id}", "updateTask"),
        ("delete", "/api/v1/tasks/{task_id}", "deleteTask"),
        ("get", "/api/v1/health", "getHealth"),
    ],
)
def test_operation_id_is_the_camel_cased_route_name(
    method: str, path: str, operation_id: str
) -> None:
    spec = create_app().openapi()

    assert spec["paths"][path][method]["operationId"] == operation_id


def test_spec_renders_with_sorted_keys_and_a_trailing_newline() -> None:
    rendered = render_spec({"b": 1, "a": {"d": [2, 1], "c": 3}})

    assert rendered == (
        '{\n  "a": {\n    "c": 3,\n    "d": [\n      2,\n      1\n    ]\n  },\n  "b": 1\n}\n'
    )


def test_export_writes_the_api_spec_to_the_given_file(tmp_path: Path) -> None:
    output = tmp_path / "openapi.json"

    export_openapi(output)

    text = output.read_text(encoding="utf-8")
    spec = json.loads(text)
    assert text.endswith("}\n")
    assert spec["info"]["title"] == "Tasky API"
    assert spec["paths"]["/api/v1/tasks"]["get"]["operationId"] == "listTasks"


def test_export_writes_the_same_bytes_every_time(tmp_path: Path) -> None:
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"

    export_openapi(first)
    export_openapi(second)

    assert first.read_bytes() == second.read_bytes()


def test_export_targets_the_spec_file_next_to_the_frontend_package_by_default() -> None:
    assert DEFAULT_OUTPUT.name == "openapi.json"
    assert (DEFAULT_OUTPUT.parent / "package.json").is_file()
    assert (DEFAULT_OUTPUT.parent / "orval.config.ts").is_file()


def _query_parameter(name: str) -> dict[str, Any]:
    parameters = create_app().openapi()["paths"]["/api/v1/tasks"]["get"]["parameters"]
    [parameter] = [candidate for candidate in parameters if candidate["name"] == name]
    return parameter


@pytest.mark.parametrize(
    ("name", "schema"),
    [
        ("status", {"$ref": "#/components/schemas/TaskStatus"}),
        ("search", {"type": "string", "title": "Search"}),
    ],
)
def test_optional_list_filter_is_documented_without_null(name: str, schema: dict[str, Any]) -> None:
    parameter = _query_parameter(name)

    assert parameter["required"] is False
    assert parameter["schema"] == schema


def test_no_query_parameter_offers_null() -> None:
    spec = create_app().openapi()

    offering_null = [
        f"{method} {path} {parameter['name']}"
        for path, operations in spec["paths"].items()
        for method, operation in operations.items()
        for parameter in operation.get("parameters", [])
        if parameter["in"] == "query" and '"null"' in json.dumps(parameter["schema"])
    ]

    assert offering_null == []


@pytest.mark.anyio
async def test_list_without_filters_is_accepted_and_filters_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked: list[TaskListQuery] = []

    async def no_tasks(_session: object, query: TaskListQuery) -> tuple[list[Any], int]:
        asked.append(query)
        return [], 0

    async def no_session() -> None:
        return None

    monkeypatch.setattr(task_service, "list_tasks", no_tasks)
    app = create_app()
    app.dependency_overrides[get_session] = no_session

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/tasks")

    assert response.status_code == 200
    assert [(query.status, query.search) for query in asked] == [(None, None)]
