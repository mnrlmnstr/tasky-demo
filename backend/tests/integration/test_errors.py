import logging
import traceback
from collections.abc import AsyncIterator, Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi.responses import StreamingResponse
from starlette.types import Message

from app.api.errors import ResponseAborted
from app.core.config import get_settings
from app.main import create_app
from tests.asgi import app_client

# Stands in for an error whose message carries credentials, like a database URL.
SECRET_MESSAGE = "postgresql+asyncpg://tasky:s3cr3t-password@db:5432/tasky"


async def _fail() -> None:
    raise RuntimeError(SECRET_MESSAGE)


@pytest.fixture
async def failing_client() -> AsyncIterator[httpx.AsyncClient]:
    """The real app with one extra route that raises an unexpected error."""
    app = create_app()
    app.add_api_route("/test-only/fail", _fail, methods=["POST"])
    async with app_client(app) as http:
        yield http


@pytest.mark.anyio
async def test_unhandled_error_returns_generic_500(failing_client: httpx.AsyncClient) -> None:
    response = await failing_client.post("/test-only/fail")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}


@pytest.mark.anyio
async def test_unhandled_error_is_logged_once_with_the_request(
    failing_client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.api.errors"):
        await failing_client.post("/test-only/fail")

    [record] = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert record.getMessage() == "unhandled_exception"
    assert record.method == "POST"
    assert record.path == "/test-only/fail"
    assert record.error_type == "RuntimeError"
    assert "in _fail" in record.traceback


@pytest.mark.anyio
async def test_unhandled_error_message_reaches_neither_response_nor_log(
    failing_client: httpx.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.DEBUG):
        response = await failing_client.post("/test-only/fail")

    assert "s3cr3t" not in response.text
    logged = [str(value) for record in caplog.records for value in vars(record).values()]
    assert [text for text in logged if "s3cr3t" in text] == []


async def _fail_mid_stream() -> StreamingResponse:
    async def _chunks() -> AsyncIterator[bytes]:
        yield b"first chunk"
        raise RuntimeError(SECRET_MESSAGE)

    return StreamingResponse(_chunks())


@pytest.mark.anyio
async def test_error_after_response_started_is_logged_and_aborts_the_response(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Driven at the ASGI interface: httpx's test transport cannot represent a response
    # that is cut off after it started.
    app = create_app()
    app.add_api_route("/test-only/fail-mid-stream", _fail_mid_stream, methods=["GET"])
    sent: list[Message] = []

    async def receive() -> Message:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: Message) -> None:
        sent.append(message)

    scope = {
        "type": "http",
        # From spec 2.4 on, a streaming response does not wait for the client to disconnect.
        "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/test-only/fail-mid-stream",
        "raw_path": b"/test-only/fail-mid-stream",
        "root_path": "",
        "query_string": b"",
        "headers": [],
        "server": ("test", 80),
        "client": ("test", 1234),
    }
    # The error reaches the server, which then drops the connection instead of ending the
    # body as if it were complete; it carries no message, since the server logs it.
    with (
        caplog.at_level(logging.ERROR, logger="app.api.errors"),
        pytest.raises(ResponseAborted) as raised,
    ):
        await app(scope, receive, send)

    starts = [m["status"] for m in sent if m["type"] == "http.response.start"]
    assert starts == [200]
    assert not any(m["type"] == "http.response.body" and not m.get("more_body") for m in sent)
    assert [r.getMessage() for r in caplog.records] == ["unhandled_exception"]
    assert "s3cr3t" not in "".join(traceback.format_exception(raised.value))


@pytest.fixture
async def openapi(client: httpx.AsyncClient) -> dict[str, Any]:
    response = await client.get("/openapi.json")
    return response.json()


def _response_schema(openapi: dict[str, Any], method: str, path: str, code: str) -> dict:
    operation = openapi["paths"][path][method]
    return operation["responses"][code]["content"]["application/json"]["schema"]


@pytest.mark.anyio
@pytest.mark.parametrize("method", ["get", "patch", "delete"])
async def test_task_routes_declare_404_with_detail_body(
    openapi: dict[str, Any], method: str
) -> None:
    schema = _response_schema(openapi, method, "/api/v1/tasks/{task_id}", "404")

    assert schema == {"$ref": "#/components/schemas/ErrorDetail"}
    assert openapi["components"]["schemas"]["ErrorDetail"]["properties"] == {
        "detail": {"type": "string", "title": "Detail"}
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/tasks"),
        ("get", "/api/v1/tasks"),
        ("get", "/api/v1/tasks/{task_id}"),
        ("patch", "/api/v1/tasks/{task_id}"),
        ("delete", "/api/v1/tasks/{task_id}"),
    ],
)
async def test_task_routes_declare_422_with_field_errors_body(
    openapi: dict[str, Any], method: str, path: str
) -> None:
    schema = _response_schema(openapi, method, path, "422")

    assert schema == {"$ref": "#/components/schemas/HTTPValidationError"}


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/tasks"),
        ("get", "/api/v1/tasks"),
        ("get", "/api/v1/tasks/{task_id}"),
        ("patch", "/api/v1/tasks/{task_id}"),
        ("delete", "/api/v1/tasks/{task_id}"),
    ],
)
async def test_task_routes_declare_500_with_detail_body(
    openapi: dict[str, Any], method: str, path: str
) -> None:
    schema = _response_schema(openapi, method, path, "500")

    assert schema == {"$ref": "#/components/schemas/ErrorDetail"}


@pytest.mark.anyio
async def test_task_update_schema_does_not_offer_null_for_required_fields(
    openapi: dict[str, Any],
) -> None:
    properties = openapi["components"]["schemas"]["TaskUpdate"]["properties"]

    assert properties["title"] == {
        "type": "string",
        "maxLength": 200,
        "minLength": 1,
        "title": "Title",
    }
    assert properties["status"] == {"$ref": "#/components/schemas/TaskStatus"}
    assert properties["priority"] == {"$ref": "#/components/schemas/TaskPriority"}


@pytest.fixture
def app_logger() -> Iterator[logging.Logger]:
    """The `app` and root loggers, put back exactly as found after the test configures them."""
    logger, root = logging.getLogger("app"), logging.getLogger()
    handlers, level = list(logger.handlers), logger.level
    root_handlers, root_level = list(root.handlers), root.level
    yield logger
    logger.handlers[:] = handlers
    logger.setLevel(level)
    root.handlers[:] = root_handlers
    root.setLevel(root_level)


@pytest.mark.anyio
async def test_library_warnings_use_the_same_readable_lines(
    app_logger: logging.Logger, capsys: pytest.CaptureFixture[str]
) -> None:
    async with app_client(create_app()):
        pass

    async with app_client(create_app()):
        logging.getLogger("sqlalchemy.pool").warning("pool_overflow", extra={"size": "5"})
        logging.getLogger("sqlalchemy.pool").info("pool_checked")

    [line] = capsys.readouterr().err.splitlines()
    assert "WARNING sqlalchemy.pool pool_overflow size=5" in line


@pytest.mark.anyio
async def test_logging_leaves_the_server_access_log_alone(app_logger: logging.Logger) -> None:
    access = logging.getLogger("uvicorn.access")
    before = (list(access.handlers), access.level, access.propagate)

    async with app_client(create_app()):
        pass

    assert (list(access.handlers), access.level, access.propagate) == before


@pytest.fixture
def debug_setting(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[[bool], None]]:
    def _set(debug: bool) -> None:
        monkeypatch.setenv("DEBUG", str(debug).lower())
        get_settings.cache_clear()

    yield _set
    monkeypatch.undo()
    get_settings.cache_clear()


@pytest.mark.anyio
async def test_started_app_logs_readable_lines_with_extra_fields(
    app_logger: logging.Logger, capsys: pytest.CaptureFixture[str]
) -> None:
    async with app_client(create_app()):
        logging.getLogger("app.services.example").warning(
            "task_reminder_skipped", extra={"task_id": "42", "reason": "no_deadline"}
        )

    [line] = capsys.readouterr().err.splitlines()
    assert "WARNING" in line
    assert "app.services.example" in line
    assert "task_reminder_skipped" in line
    assert "task_id=42" in line
    assert "reason=no_deadline" in line


@pytest.mark.anyio
@pytest.mark.parametrize(("debug", "lines"), [(True, 2), (False, 1)])
async def test_debug_lines_are_shown_only_when_debug_is_on(
    app_logger: logging.Logger,
    debug_setting: Callable[[bool], None],
    capsys: pytest.CaptureFixture[str],
    debug: bool,
    lines: int,
) -> None:
    debug_setting(debug)

    async with app_client(create_app()):
        logging.getLogger("app.services.example").debug("cache_checked")
        logging.getLogger("app.services.example").info("cache_filled")

    assert len(capsys.readouterr().err.splitlines()) == lines


@pytest.mark.anyio
async def test_starting_the_app_twice_prints_each_line_once(
    app_logger: logging.Logger, capsys: pytest.CaptureFixture[str]
) -> None:
    async with app_client(create_app()):
        pass

    async with app_client(create_app()):
        logging.getLogger("app.services.example").warning("task_reminder_skipped")

    assert len(capsys.readouterr().err.splitlines()) == 1
