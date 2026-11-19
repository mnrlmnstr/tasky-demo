import json
from pathlib import Path

import pytest

from app.main import create_app
from scripts.export_openapi import DEFAULT_OUTPUT, export_openapi, render_spec

REPO_ROOT = Path(__file__).resolve().parents[3]


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


def test_export_targets_the_frontend_spec_file_by_default() -> None:
    assert REPO_ROOT / "frontend" / "openapi.json" == DEFAULT_OUTPUT
