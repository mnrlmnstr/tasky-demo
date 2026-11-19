import io
import logging

import pytest

from app.core.logging import _StderrHandler


class _BrokenStream(io.StringIO):
    def write(self, text: str) -> int:
        raise OSError("stream closed")


def test_a_record_that_cannot_be_written_goes_to_handle_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handled: list[logging.LogRecord] = []
    handler = _StderrHandler()
    monkeypatch.setattr(handler, "handleError", handled.append)
    monkeypatch.setattr("sys.stderr", _BrokenStream())
    record = logging.makeLogRecord({"msg": "task_created"})

    handler.emit(record)

    assert handled == [record]
