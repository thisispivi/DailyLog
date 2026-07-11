"""Telegram-safe presentation functions for persisted DailyLog entries."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from dailylogbot.db import Entry, WeighIn
from dailylogbot.i18n import button, format_report_date, kind_name
from dailylogbot.measurements import format_weight


def entry_line(entry: Entry, tz: ZoneInfo, language_code: str | None = None) -> str:
    """Render one saved entry as a compact, readable Telegram confirmation line."""
    if entry.kind == "meal":
        details = f"\n{entry.text}" if entry.text else ""
        timestamp = _fmt_dt(entry.start_at, tz, language_code)
        return f"#{entry.id} 🍽 {_meal_name(entry.label, language_code)} · {timestamp}{details}"
    if entry.kind == "training":
        details = f" · {entry.text}" if entry.text else ""
        return f"#{entry.id} 🏃 {entry.label}{details}\n{_fmt_range(entry, tz, language_code)}"
    return f"#{entry.id} 😴 {kind_name(language_code, 'sleep').title()}\n{_fmt_range(entry, tz, language_code)}"


def entries_block(entries: list[Entry], tz: ZoneInfo, language_code: str | None = None) -> str:
    """Render a chronological list of entries with visual separation for Telegram."""
    return "\n\n".join(entry_line(entry, tz, language_code) for entry in entries)


def weigh_in_line(weigh_in: WeighIn, tz: ZoneInfo, language_code: str | None, weight_unit: str) -> str:
    """Render one saved body-weight record for Telegram."""
    timestamp = _fmt_dt(weigh_in.recorded_at, tz, language_code)
    return f"#{weigh_in.id} ⚖️ {format_weight(weigh_in.weight_grams, weight_unit)} · {timestamp}"


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


def _fmt_range(entry: Entry, tz: ZoneInfo, language_code: str | None) -> str:
    """Render an activity range, including a clear marker for an open activity."""
    start = _fmt_dt(entry.start_at, tz, language_code)
    end = _fmt_dt(entry.end_at, tz, language_code) if entry.end_at else "…"
    return f"{start} → {end}"


def _fmt_dt(value: datetime | None, tz: ZoneInfo, language_code: str | None) -> str:
    """Format a timestamp in the configured timezone or return an open marker."""
    if value is None:
        return "…"
    local = value.astimezone(tz)
    return f"{format_report_date(local.date(), language_code)}, {local:%H:%M}"
