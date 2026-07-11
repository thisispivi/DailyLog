"""Regression tests for startup configuration validation."""

from __future__ import annotations

import json
import logging

import pytest

from dailylogbot.config import load_config
from dailylogbot.logging_config import JsonLogFormatter


def test_load_config_accepts_typed_network_settings() -> None:
    """Parse valid runtime settings from an injected environment mapping."""
    config = load_config(
        {
            "BOT_TOKEN": "123456:token",
            "ALLOWED_USER_ID": "123",
            "TIMEZONE": "Europe/Berlin",
            "DATABASE_PATH": "data/test.sqlite3",
            "LOG_LEVEL": "debug",
            "TELEGRAM_NETWORK_TIMEOUT_SECONDS": "12.5",
            "TELEGRAM_CONNECTION_POOL_SIZE": "4",
        }
    )

    assert config.log_level == "DEBUG"
    assert config.telegram_network_timeout_seconds == 12.5
    assert config.telegram_connection_pool_size == 4


@pytest.mark.parametrize(
    ("setting", "value"),
    [
        ("TELEGRAM_NETWORK_TIMEOUT_SECONDS", "0"),
        ("TELEGRAM_NETWORK_TIMEOUT_SECONDS", "nan"),
        ("TELEGRAM_NETWORK_TIMEOUT_SECONDS", "not-a-number"),
        ("TELEGRAM_CONNECTION_POOL_SIZE", "0"),
        ("TELEGRAM_CONNECTION_POOL_SIZE", "1.5"),
    ],
)
def test_load_config_rejects_invalid_network_settings(setting: str, value: str) -> None:
    """Fail fast for invalid timeout and connection-pool settings."""
    environment = {
        "BOT_TOKEN": "123456:token",
        "ALLOWED_USER_ID": "123",
        setting: value,
    }

    with pytest.raises(RuntimeError):
        load_config(environment)


def test_structured_logs_redact_telegram_tokens() -> None:
    """Prevent an accidental token-shaped framework message from reaching stdout."""
    record = logging.makeLogRecord(
        {
            "msg": "Request to 123456:abcdefghijklmnopqrstuvwxyzABCDE failed",
            "levelno": logging.ERROR,
            "levelname": "ERROR",
            "name": "dailylogbot.test",
        }
    )

    payload = json.loads(JsonLogFormatter().format(record))

    assert payload["message"] == "Request to [REDACTED] failed"
