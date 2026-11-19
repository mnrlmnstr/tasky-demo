"""Stdlib logging: plain readable lines that show `extra` fields, for the app and its libraries.

The handler sits on the root logger, so library records (SQLAlchemy, asyncpg) that propagate
share the format. Uvicorn's own loggers, the access log among them, have their own handlers
and don't propagate, so no record is printed twice.
"""

import logging
import sys

from app.core.config import Settings

APP_LOGGER = "app"

# Every attribute a bare LogRecord has; anything else on a record came from `extra`.
_STANDARD_ATTRIBUTES = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class ExtraFieldsFormatter(logging.Formatter):
    """`<time> <LEVEL> <logger> <event> key=value ...`, with the `extra` fields at the end."""

    def __init__(self) -> None:
        super().__init__("%(asctime)s %(levelname)s %(name)s %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        line = super().format(record)
        extra = [
            f"{key}={value}"
            for key, value in vars(record).items()
            if key not in _STANDARD_ATTRIBUTES
        ]
        return " ".join([line, *extra])


class _StderrHandler(logging.Handler):
    """Writes to whatever `sys.stderr` is at the time of each record, not at creation."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            sys.stderr.write(self.format(record) + "\n")
            sys.stderr.flush()
        except Exception:
            self.handleError(record)


def configure_logging(settings: Settings) -> None:
    """Set up the root handler and the `app` level; calling it again only updates the level."""
    root = logging.getLogger()
    if not any(isinstance(handler, _StderrHandler) for handler in root.handlers):
        handler = _StderrHandler()
        handler.setFormatter(ExtraFieldsFormatter())
        root.addHandler(handler)
    # Libraries keep the root's level (WARNING by default); the app's own events go lower.
    logging.getLogger(APP_LOGGER).setLevel(logging.DEBUG if settings.debug else logging.INFO)
