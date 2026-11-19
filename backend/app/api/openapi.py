"""What the OpenAPI document says about the API as a whole, beyond its routes."""

from collections.abc import Sequence
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute


def description(api_prefix: str) -> str:
    return f"""
A small task tracker: create, list, update and delete tasks.

All endpoints live under `{api_prefix}`.

**Errors.** A missing task is a `404` with `{{"detail": "Task not found"}}`. A request that
fails validation is a `422` whose `detail` lists the problems, one per field. Any other
failure is a `500` with `{{"detail": "Internal server error"}}`.

**Soft delete.** Deleting a task hides it: it no longer appears in lists, and reading,
updating or deleting it again answers `404`.
"""


TAGS = [
    {"name": "tasks", "description": "Create, list, read, update and delete tasks."},
    {"name": "health", "description": "Whether the API and its database are up."},
]


def _restore_body_example_values(
    schema: dict[str, Any], prefix: str, routers: Sequence[APIRouter]
) -> None:
    """Puts each request-body example's value back as declared.

    FastAPI drops every null from the document, so `{"deadline": null}` would show as `{}`.
    """
    for router in routers:
        for route in router.routes:
            if not isinstance(route, APIRoute) or route.body_field is None:
                continue
            declared = getattr(route.body_field.field_info, "openapi_examples", None) or {}
            for method in route.methods:
                operation = schema["paths"][prefix + route.path_format][method.lower()]
                shown = operation["requestBody"]["content"]["application/json"].get("examples", {})
                for name, example in declared.items():
                    shown[name]["value"] = example["value"]


def install_openapi(app: FastAPI, prefix: str, routers: Sequence[APIRouter]) -> None:
    """Makes `app`, which serves `routers` under `prefix`, keep request-body examples intact."""

    def openapi() -> dict[str, Any]:
        # FastAPI.openapi builds the document once and caches it; restoring is idempotent.
        schema = FastAPI.openapi(app)
        _restore_body_example_values(schema, prefix, routers)
        return schema

    app.openapi = openapi  # type: ignore[method-assign]
