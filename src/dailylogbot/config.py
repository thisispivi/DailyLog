from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    """Validated runtime settings loaded from the local environment."""

    bot_token: str
    allowed_user_id: int
    timezone_name: str
    database_path: Path
    log_level: str

    @property
    def timezone(self) -> ZoneInfo:
        """Return the configured IANA timezone as a reusable zone object."""
        return ZoneInfo(self.timezone_name)


def load_config() -> Config:
    """Load and validate configuration without ever logging the bot token."""
    load_dotenv()

    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BOT_TOKEN is required. Create a Telegram bot with BotFather and set it in .env.")

    allowed_user_id_raw = os.getenv("ALLOWED_USER_ID", "").strip()
    if not allowed_user_id_raw:
        raise RuntimeError("ALLOWED_USER_ID is required so only you can use this private bot.")

    try:
        allowed_user_id = int(allowed_user_id_raw)
    except ValueError as exc:
        raise RuntimeError("ALLOWED_USER_ID must be a numeric Telegram user ID.") from exc
    if allowed_user_id <= 0:
        raise RuntimeError("ALLOWED_USER_ID must be a positive Telegram user ID.")

    timezone_name = os.getenv("TIMEZONE", "Europe/Berlin").strip() or "Europe/Berlin"
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError("TIMEZONE must be a valid IANA timezone, such as Europe/Berlin.") from exc
    database_path = Path(os.getenv("DATABASE_PATH", "data/dailylogbot.sqlite3")).expanduser()
    log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"
    if log_level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
        raise RuntimeError("LOG_LEVEL must be CRITICAL, ERROR, WARNING, INFO, or DEBUG.")

    return Config(
        bot_token=token,
        allowed_user_id=allowed_user_id,
        timezone_name=timezone_name,
        database_path=database_path,
        log_level=log_level,
    )
