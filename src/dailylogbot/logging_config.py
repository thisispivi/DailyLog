"""Structured, privacy-conscious logging configuration for DailyLog."""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Final

_STANDARD_LOG_RECORD_FIELDS: Final = frozenset(logging.makeLogRecord({}).__dict__)
_TELEGRAM_TOKEN_PATTERN: Final = re.compile(r"\b\d{5,}:[A-Za-z0-9_-]{20,}\b")


class JsonLogFormatter(logging.Formatter):
    """Render log records as single-line JSON objects for production observability."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize a log record while retaining safe structured context.

        Args:
            record: Log record emitted by the Python logging framework.

        Returns:
            One JSON object suitable for console log collectors.
        """
        event: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": _sanitize_log_value(record.getMessage()),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_LOG_RECORD_FIELDS and _is_loggable_value(value):
                event[key] = _sanitize_log_value(value) if isinstance(value, str) else value
        if record.exc_info:
            event["exception"] = self.formatException(record.exc_info)
        return json.dumps(event, ensure_ascii=False, default=str)


def configure_logging(log_level: str) -> None:
    """Configure root logging exactly once with a structured stdout formatter.

    Args:
        log_level: Valid uppercase Python logging level.

    Side Effects:
        Replaces the root logger's handlers.
    """
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(JsonLogFormatter())
    logging.basicConfig(level=log_level, handlers=[stream_handler], force=True)


def _is_loggable_value(value: object) -> bool:
    """Return whether a context value is safe to serialize as structured metadata.

    Args:
        value: Potential metadata value supplied through ``logging``'s ``extra`` argument.

    Returns:
        ``True`` for primitive, non-secret-compatible structured values.
    """
    return value is None or isinstance(value, str | int | float | bool)


def _sanitize_log_value(value: str) -> str:
    """Redact Telegram bot tokens from a potentially framework-generated value.

    Args:
        value: Text to include in a structured log field.

    Returns:
        Text with token-shaped values replaced by a redaction marker.
    """
    return _TELEGRAM_TOKEN_PATTERN.sub("[REDACTED]", value)
