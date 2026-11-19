"""Stdlib logging for the app's own loggers (`app.*`): plain lines that show `extra` fields.

Only the `app` logger gets a handler. Uvicorn configures its own loggers (including the
access log) and leaves the root logger alone, so the two never print the same record.
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


class _StderrHandler(logging.StreamHandler):
    """Writes to whatever `sys.stderr` is at the time of each record, not at creation."""

    def __init__(self) -> None:
        logging.Handler.__init__(self)

    @property
    def stream(self):  # type: ignore[override]
        return sys.stderr


def configure_logging(settings: Settings) -> None:
    """Set up the `app` logger; calling it again only updates the level."""
    logger = logging.getLogger(APP_LOGGER)
    logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)
    if not any(isinstance(handler, _StderrHandler) for handler in logger.handlers):
        handler = _StderrHandler()
        handler.setFormatter(ExtraFieldsFormatter())
        logger.addHandler(handler)
