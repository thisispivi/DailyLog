from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from dailylogbot.db import Entry
from dailylogbot.i18n import button, kind_name


def entry_line(entry: Entry, tz: ZoneInfo, language_code: str | None = None) -> str:
    """Render one saved entry as a compact, readable Telegram confirmation line."""
    if entry.kind == "meal":
        details = f"\n{entry.text}" if entry.text else ""
        return f"#{entry.id} 🍽 {_meal_name(entry.label, language_code)} · {_fmt_dt(entry.start_at, tz)}{details}"
    if entry.kind == "training":
        details = f" · {entry.text}" if entry.text else ""
        return f"#{entry.id} 🏃 {entry.label}{details}\n{_fmt_range(entry, tz)}"
    return f"#{entry.id} 😴 {kind_name(language_code, 'sleep').title()}\n{_fmt_range(entry, tz)}"


def entries_block(entries: list[Entry], tz: ZoneInfo, language_code: str | None = None) -> str:
    """Render a chronological list of entries with visual separation for Telegram."""
    return "\n\n".join(entry_line(entry, tz, language_code) for entry in entries)


def _meal_name(label: str, language_code: str | None) -> str:
    """Return a localized display label for known meal types and preserve custom ones."""
    keys = {
        "Breakfast": "breakfast",
        "Snack 1": "snack_1",
        "Lunch": "lunch",
        "Snack 2": "snack_2",
        "Dinner": "dinner",
    }
    return button(language_code, keys[label]) if label in keys else label


def _fmt_range(entry: Entry, tz: ZoneInfo) -> str:
    """Render an activity range, including a clear marker for an open activity."""
    start = _fmt_dt(entry.start_at, tz)
    end = _fmt_dt(entry.end_at, tz) if entry.end_at else "…"
    return f"{start} → {end}"


def _fmt_dt(value: datetime | None, tz: ZoneInfo) -> str:
    """Format a timestamp in the configured timezone or return an open marker."""
    return value.astimezone(tz).strftime("%d %b, %H:%M") if value is not None else "…"
