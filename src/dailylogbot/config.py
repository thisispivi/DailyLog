"""Typed runtime configuration loaded once from the environment."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from math import isfinite
from pathlib import Path
from typing import Final
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv

_VALID_LOG_LEVELS: Final = frozenset({"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"})
_DEFAULT_TIMEZONE: Final = "Europe/Berlin"
_DEFAULT_DATABASE_PATH: Final = "data/dailylogbot.sqlite3"
_DEFAULT_LOG_LEVEL: Final = "INFO"
_DEFAULT_NETWORK_TIMEOUT_SECONDS: Final = 10.0
_DEFAULT_CONNECTION_POOL_SIZE: Final = 8


@dataclass(frozen=True)
class Config:
    """Validated immutable settings used by all runtime components."""

    bot_token: str
    allowed_user_id: int
    timezone_name: str
    database_path: Path
    log_level: str
    telegram_network_timeout_seconds: float = _DEFAULT_NETWORK_TIMEOUT_SECONDS
    telegram_connection_pool_size: int = _DEFAULT_CONNECTION_POOL_SIZE

    @property
    def timezone(self) -> ZoneInfo:
        """Return the configured IANA timezone.

        Returns:
            A timezone instance suitable for date parsing and presentation.
        """
        return ZoneInfo(self.timezone_name)


def load_config(environment: Mapping[str, str] | None = None) -> Config:
    """Load and validate configuration without exposing credentials.

    Args:
        environment: Optional environment mapping for tests. When omitted, the
            process environment is read after ``.env`` loading.

    Returns:
        Validated immutable runtime configuration.

    Raises:
        RuntimeError: If a required or optional setting has an invalid value.

    Side Effects:
        Loads a local ``.env`` file only when ``environment`` is omitted.
    """
    if environment is None:
        load_dotenv()
        environment = os.environ

    token = environment.get("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BOT_TOKEN is required. Create a Telegram bot with BotFather and set it in .env.")

    allowed_user_id_raw = environment.get("ALLOWED_USER_ID", "").strip()
    if not allowed_user_id_raw:
        raise RuntimeError("ALLOWED_USER_ID is required so only you can use this private bot.")
    try:
        allowed_user_id = int(allowed_user_id_raw)
    except ValueError as error:
        raise RuntimeError("ALLOWED_USER_ID must be a numeric Telegram user ID.") from error
    if allowed_user_id <= 0:
        raise RuntimeError("ALLOWED_USER_ID must be a positive Telegram user ID.")

    timezone_name = environment.get("TIMEZONE", _DEFAULT_TIMEZONE).strip() or _DEFAULT_TIMEZONE
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as error:
        raise RuntimeError("TIMEZONE must be a valid IANA timezone, such as Europe/Berlin.") from error

    database_path = Path(environment.get("DATABASE_PATH", _DEFAULT_DATABASE_PATH)).expanduser()
    if not database_path.name:
        raise RuntimeError("DATABASE_PATH must identify a database file.")
    log_level = environment.get("LOG_LEVEL", _DEFAULT_LOG_LEVEL).strip().upper() or _DEFAULT_LOG_LEVEL
    if log_level not in _VALID_LOG_LEVELS:
        raise RuntimeError("LOG_LEVEL must be CRITICAL, ERROR, WARNING, INFO, or DEBUG.")

    return Config(
        bot_token=token,
        allowed_user_id=allowed_user_id,
        timezone_name=timezone_name,
        database_path=database_path,
        log_level=log_level,
        telegram_network_timeout_seconds=_read_positive_float(
            environment,
            "TELEGRAM_NETWORK_TIMEOUT_SECONDS",
            _DEFAULT_NETWORK_TIMEOUT_SECONDS,
        ),
        telegram_connection_pool_size=_read_positive_int(
            environment,
            "TELEGRAM_CONNECTION_POOL_SIZE",
            _DEFAULT_CONNECTION_POOL_SIZE,
        ),
    )


def _read_positive_float(environment: Mapping[str, str], key: str, default: float) -> float:
    """Read a finite, positive floating-point configuration value.

    Args:
        environment: Source configuration mapping.
        key: Environment variable name.
        default: Value used for a missing or blank setting.

    Returns:
        Parsed positive floating-point value.

    Raises:
        RuntimeError: If the supplied value is not a positive float.
    """
    raw_value = environment.get(key, str(default)).strip()
    try:
        parsed_value = float(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{key} must be a positive number.") from error
    if not isfinite(parsed_value) or parsed_value <= 0:
        raise RuntimeError(f"{key} must be a positive number.")
    return parsed_value


def _read_positive_int(environment: Mapping[str, str], key: str, default: int) -> int:
    """Read a positive integer configuration value.

    Args:
        environment: Source configuration mapping.
        key: Environment variable name.
        default: Value used for a missing or blank setting.

    Returns:
        Parsed positive integer value.

    Raises:
        RuntimeError: If the supplied value is not a positive integer.
    """
    raw_value = environment.get(key, str(default)).strip()
    try:
        parsed_value = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{key} must be a positive integer.") from error
    if parsed_value <= 0:
        raise RuntimeError(f"{key} must be a positive integer.")
    return parsed_value
