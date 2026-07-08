from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from dailylogbot.db import Entry


def entry_line(entry: Entry, tz: ZoneInfo) -> str:
    if entry.kind == "meal":
        return f"#{entry.id} Meal | {entry.label} | {_fmt_dt(entry.start_at, tz)} | {entry.text}"
    if entry.kind == "training":
        return f"#{entry.id} Training | {entry.label} | {_fmt_range(entry, tz)}"
    return f"#{entry.id} Sleep | {_fmt_range(entry, tz)}"


def entries_block(entries: list[Entry], tz: ZoneInfo) -> str:
    if not entries:
        return "No entries."
    return "\n".join(entry_line(entry, tz) for entry in entries)


def _fmt_range(entry: Entry, tz: ZoneInfo) -> str:
    start = _fmt_dt(entry.start_at, tz)
    end = _fmt_dt(entry.end_at, tz) if entry.end_at else "open"
    return f"{start} -> {end}"


def _fmt_dt(value: datetime | None, tz: ZoneInfo) -> str:
    if value is None:
        return "open"
    return value.astimezone(tz).strftime("%Y-%m-%d %H:%M")

