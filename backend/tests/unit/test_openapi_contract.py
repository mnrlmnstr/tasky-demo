import pytest

from app.main import create_app
from scripts.export_openapi import DEFAULT_OUTPUT, render_spec


def test_committed_frontend_spec_matches_the_api() -> None:
    assert DEFAULT_OUTPUT.read_text(encoding="utf-8") == render_spec(create_app().openapi())


@pytest.mark.parametrize(
    "schema", ["Task", "TaskStatus", "TaskPriority", "TaskCreate", "TaskUpdate"]
)
def test_spec_names_the_schemas_the_client_types_are_generated_from(schema: str) -> None:
    spec = create_app().openapi()

    assert schema in spec["components"]["schemas"]
