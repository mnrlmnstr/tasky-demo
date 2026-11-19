"""Writes the API's OpenAPI spec to frontend/openapi.json.

Run from backend/ after the API changes: `python -m scripts.export_openapi`.
Needs neither a database nor a running server.
"""

import json
from pathlib import Path
from typing import Any

from app.main import create_app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"


def render_spec(spec: dict[str, Any]) -> str:
    """The spec as text that only changes when the spec does."""
    return json.dumps(spec, indent=2, sort_keys=True) + "\n"


def export_openapi(output: Path = DEFAULT_OUTPUT) -> None:
    output.write_text(render_spec(create_app().openapi()), encoding="utf-8")


if __name__ == "__main__":  # pragma: no cover - entry point, the functions above are tested
    export_openapi()
