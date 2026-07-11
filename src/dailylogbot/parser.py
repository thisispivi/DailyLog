"""Side-effect-free parsing for DailyLog's compact text commands."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from dailylogbot.db import EntryFieldValue

MEAL_ALIASES = {
    "breakfast": "Breakfast",
    "colazione": "Breakfast",
    "snack 1": "Snack 1",
    "snack1": "Snack 1",
    "spuntino 1": "Snack 1",
    "spuntino1": "Snack 1",
    "merenda 1": "Snack 1",
    "snack 2": "Snack 2",
    "snack2": "Snack 2",
    "spuntino 2": "Snack 2",
    "spuntino2": "Snack 2",
    "merenda 2": "Snack 2",
    "lunch": "Lunch",
    "pranzo": "Lunch",
    "dinner": "Dinner",
    "cena": "Dinner",
}
SLEEP_START = frozenset({"sleep", "start sleep", "dormo", "vado a dormire", "inizia sonno"})
SLEEP_END = frozenset(
    {"wake", "wakeup", "wake up", "sleep end", "end sleep", "sveglia", "mi sono svegliato", "fine sonno"}
)
TRAINING_END = frozenset({"stop", "end", "done", "finish", "finished", "fine", "finito", "fine sport", "end training"})
TRAINING_START_BUTTONS = frozenset({"start training", "inizia sport", "inizia allenamento"})
DATE_RANGE_PATTERN = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$")


@dataclass(frozen=True)
class ParsedAction:
    """A validated interpretation of one compact user message."""

    action: str
    kind: str | None = None
    label: str | None = None
    text: str = ""
    start_at: datetime | None = None
    end_at: datetime | None = None
    export_format: str | None = None
    start_date: date | None = None
    end_date: date | None = None


def parse_message(raw_text: str, now: datetime, tz: ZoneInfo) -> ParsedAction | None:
    """Parse a compact meal, activity, sleep, or export command without side effects."""
    text = " ".join(raw_text.strip().split())
    if not text:
        return None
    lowered = text.casefold()
    export = _parse_export(lowered, now)
    if export is not None:
        return export
    meal = _parse_meal(text, now)
    if meal is not None:
        return meal
    sleep_range = _parse_sleep_range(lowered, now, tz)
    if sleep_range is not None:
        return sleep_range
    training_range = _parse_training_range(text, now, tz)
    if training_range is not None:
        return training_range
    if lowered in SLEEP_START:
        return ParsedAction(action="start_range", kind="sleep", label="Sleep", start_at=now)
    if lowered in SLEEP_END:
        return ParsedAction(action="end_range", kind="sleep", end_at=now)
    if lowered in TRAINING_END:
        return ParsedAction(action="end_range", kind="training", end_at=now)
    if lowered in TRAINING_START_BUTTONS:
        return ParsedAction(action="prompt_training")
    if _looks_like_activity(text):
        return ParsedAction(action="start_range", kind="training", label=text, start_at=now)
    return None


def parse_date_range(raw_text: str) -> tuple[date, date]:
    """Parse a strict pair of ISO dates for the final export wizard step."""
    match = DATE_RANGE_PATTERN.fullmatch(" ".join(raw_text.strip().split()))
    if match is None:
        raise ValueError("Expected two ISO dates")
    try:
        return date.fromisoformat(match.group(1)), date.fromisoformat(match.group(2))
    except ValueError as exc:
        raise ValueError("Invalid ISO date") from exc


def parse_edit_fields(raw_fields: str, tz: ZoneInfo) -> dict[str, EntryFieldValue]:
    """Extract supported key=value edit fields and convert date fields to local time."""
    fields: dict[str, EntryFieldValue] = {}
    for key in ("kind", "label", "text", "start", "end"):
        match = re.search(rf"(?:^|\s){key}=((?:(?!\s(?:kind|label|text|start|end)=).)+)", raw_fields, re.IGNORECASE)
        if match is None:
            continue
        value = match.group(1).strip()
        if key == "start":
            fields["start_at"] = parse_local_datetime(value, tz)
        elif key == "end":
            fields["end_at"] = (
                parse_local_datetime(value, tz) if value.casefold() not in {"none", "open", "-"} else None
            )
        elif key == "kind":
            normalized = value.casefold()
            if normalized not in {"meal", "training", "sleep"}:
                raise ValueError("kind must be meal, training, or sleep")
            fields["kind"] = normalized
        else:
            fields[key] = value
    return fields


def parse_local_datetime(value: str, tz: ZoneInfo) -> datetime:
    """Parse a local ISO-like date or datetime into a timezone-aware value."""
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(value.strip(), fmt).replace(tzinfo=tz)
        except ValueError:
            continue
        if fmt == "%Y-%m-%d":
            parsed = datetime.combine(parsed.date(), time.min)
        return parsed.replace(tzinfo=tz)
    raise ValueError("Invalid datetime. Use YYYY-MM-DD HH:MM")


def _parse_meal(text: str, now: datetime) -> ParsedAction | None:
    """Parse a meal that starts with an English or Italian meal-type alias."""
    lowered = text.casefold()
    for alias in sorted(MEAL_ALIASES, key=len, reverse=True):
        if lowered == alias or lowered.startswith(f"{alias} "):
            return ParsedAction(
                action="add_entry",
                kind="meal",
                label=MEAL_ALIASES[alias],
                text=text[len(alias) :].strip(),
                start_at=now,
            )
    return None


def _parse_export(lowered: str, now: datetime) -> ParsedAction | None:
    """Parse a complete compact export command, defaulting to the current month."""
    match = re.fullmatch(r"/?(?:export|esporta)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})(?:\s+(xlsx|pdf))?", lowered)
    if match is not None:
        start_date, end_date = parse_date_range(f"{match.group(1)} {match.group(2)}")
        return ParsedAction(
            action="export", start_date=start_date, end_date=end_date, export_format=match.group(3) or "xlsx"
        )
    month_match = re.fullmatch(r"/?(?:export|esporta)(?:\s+(xlsx|pdf))?", lowered)
    if month_match is None:
        return None
    start_date, end_date = _month_bounds(now.date())
    return ParsedAction(
        action="export", start_date=start_date, end_date=end_date, export_format=month_match.group(1) or "xlsx"
    )


def _parse_sleep_range(lowered: str, now: datetime, tz: ZoneInfo) -> ParsedAction | None:
    """Parse an explicit sleep clock range, assigning a crossing start to yesterday."""
    match = re.fullmatch(r"(?:sleep|sonno|dormito)\s+(\d{1,2}:\d{2})\s*[-\N{EN DASH}]\s*(\d{1,2}:\d{2})", lowered)
    if match is None:
        return None
    start_clock = _parse_clock(match.group(1))
    end_clock = _parse_clock(match.group(2))
    end_at = datetime.combine(now.date(), end_clock, tzinfo=tz)
    start_date = now.date() if start_clock < end_clock else now.date() - timedelta(days=1)
    return ParsedAction(
        action="add_entry",
        kind="sleep",
        label="Sleep",
        start_at=datetime.combine(start_date, start_clock, tzinfo=tz),
        end_at=end_at,
    )


def _parse_training_range(text: str, now: datetime, tz: ZoneInfo) -> ParsedAction | None:
    """Parse an activity followed by a same-day or overnight clock range."""
    match = re.fullmatch(r"(.+?)\s+(\d{1,2}:\d{2})\s*[-\N{EN DASH}]\s*(\d{1,2}:\d{2})", text)
    if match is None:
        return None
    label = match.group(1).strip()
    if label.casefold() in MEAL_ALIASES:
        return None
    start_at = datetime.combine(now.date(), _parse_clock(match.group(2)), tzinfo=tz)
    end_at = datetime.combine(now.date(), _parse_clock(match.group(3)), tzinfo=tz)
    if end_at < start_at:
        end_at += timedelta(days=1)
    return ParsedAction(action="add_entry", kind="training", label=label, start_at=start_at, end_at=end_at)


def _parse_clock(value: str) -> time:
    """Parse a 24-hour clock and let ``time`` enforce valid hour and minute bounds."""
    hour, minute = value.split(":", 1)
    return time(hour=int(hour), minute=int(minute))


def _month_bounds(day: date) -> tuple[date, date]:
    """Return the inclusive first and final dates of the supplied day's month."""
    start = day.replace(day=1)
    next_month = (
        start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    )
    return start, next_month - timedelta(days=1)


def _looks_like_activity(text: str) -> bool:
    """Conservatively accept short natural-language activity names as quick entries."""
    lowered = text.casefold()
    return (
        len(text) <= 120
        and not lowered.startswith("/")
        and not any(character in text for character in "?!")
        and bool(re.search(r"[a-zA-ZÀ-ÿ]", text))
    )
