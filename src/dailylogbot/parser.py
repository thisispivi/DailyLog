from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


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
SLEEP_START = {"sleep", "start sleep", "dormo", "vado a dormire", "inizia sonno"}
SLEEP_END = {"wake", "wakeup", "wake up", "sleep end", "end sleep", "sveglia", "mi sono svegliato", "fine sonno"}
TRAINING_END = {"stop", "end", "done", "finish", "finished", "fine", "finito", "fine sport", "end training"}
TRAINING_START_BUTTONS = {"start training", "inizia sport"}


@dataclass(frozen=True)
class ParsedAction:
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
    text = " ".join(raw_text.strip().split())
    if not text:
        return None
    lowered = text.lower()

    export = _parse_export(lowered, now)
    if export:
        return export

    meal = _parse_meal(text, now)
    if meal:
        return meal

    sleep_range = _parse_sleep_range(lowered, now, tz)
    if sleep_range:
        return sleep_range

    training_range = _parse_training_range(text, now, tz)
    if training_range:
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


def parse_edit_fields(raw_fields: str, tz: ZoneInfo) -> dict[str, object]:
    fields: dict[str, object] = {}
    for key in ("kind", "label", "text", "start", "end"):
        match = re.search(rf"(?:^|\s){key}=((?:(?!\s(?:kind|label|text|start|end)=).)+)", raw_fields, re.IGNORECASE)
        if not match:
            continue
        value = match.group(1).strip()
        if key == "start":
            fields["start_at"] = parse_local_datetime(value, tz)
        elif key == "end":
            fields["end_at"] = parse_local_datetime(value, tz) if value.lower() not in {"none", "open", "-"} else None
        elif key == "kind":
            normalized = value.lower()
            if normalized not in {"meal", "training", "sleep"}:
                raise ValueError("kind must be meal, training, or sleep")
            fields["kind"] = normalized
        else:
            fields[key] = value
    return fields


def parse_local_datetime(value: str, tz: ZoneInfo) -> datetime:
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(value, fmt)
            if fmt == "%Y-%m-%d":
                parsed = datetime.combine(parsed.date(), time.min)
            return parsed.replace(tzinfo=tz)
        except ValueError:
            pass
    raise ValueError(f"Invalid datetime: {value}. Use YYYY-MM-DD HH:MM")


def _parse_meal(text: str, now: datetime) -> ParsedAction | None:
    lowered = text.lower()
    for alias in sorted(MEAL_ALIASES, key=len, reverse=True):
        if lowered == alias or lowered.startswith(alias + " "):
            details = text[len(alias) :].strip()
            return ParsedAction(action="add_entry", kind="meal", label=MEAL_ALIASES[alias], text=details, start_at=now)
    return None


def _parse_export(lowered: str, now: datetime) -> ParsedAction | None:
    match = re.match(r"^/?(?:export|esporta)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})(?:\s+(xlsx|pdf))?$", lowered)
    if match:
        start_date = date.fromisoformat(match.group(1))
        end_date = date.fromisoformat(match.group(2))
        export_format = match.group(3) or "xlsx"
        return ParsedAction(action="export", start_date=start_date, end_date=end_date, export_format=export_format)

    month_match = re.match(r"^/?(?:export|esporta)(?:\s+(xlsx|pdf))?$", lowered)
    if not month_match:
        return None
    start_date, end_date = _month_bounds(now.date())
    return ParsedAction(
        action="export",
        start_date=start_date,
        end_date=end_date,
        export_format=month_match.group(1) or "xlsx",
    )


def _parse_sleep_range(lowered: str, now: datetime, tz: ZoneInfo) -> ParsedAction | None:
    match = re.match(r"^(?:sleep|sonno|dormito)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$", lowered)
    if not match:
        return None
    start_clock = _parse_clock(match.group(1))
    end_clock = _parse_clock(match.group(2))
    end_dt = datetime.combine(now.date(), end_clock, tzinfo=tz)
    start_date = now.date() if start_clock < end_clock else now.date() - timedelta(days=1)
    start_dt = datetime.combine(start_date, start_clock, tzinfo=tz)
    return ParsedAction(action="add_entry", kind="sleep", label="Sleep", start_at=start_dt, end_at=end_dt)


def _parse_training_range(text: str, now: datetime, tz: ZoneInfo) -> ParsedAction | None:
    match = re.match(r"^(.+?)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$", text)
    if not match:
        return None
    label = match.group(1).strip()
    if label.lower() in MEAL_ALIASES:
        return None
    start_clock = _parse_clock(match.group(2))
    end_clock = _parse_clock(match.group(3))
    start_dt = datetime.combine(now.date(), start_clock, tzinfo=tz)
    end_dt = datetime.combine(now.date(), end_clock, tzinfo=tz)
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    return ParsedAction(action="add_entry", kind="training", label=label, start_at=start_dt, end_at=end_dt)


def _parse_clock(value: str) -> time:
    hour, minute = value.split(":", 1)
    return time(hour=int(hour), minute=int(minute))


def _month_bounds(day: date) -> tuple[date, date]:
    start = day.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1)
    else:
        next_month = start.replace(month=start.month + 1)
    return start, next_month - timedelta(days=1)


def _looks_like_activity(text: str) -> bool:
    lowered = text.lower()
    if len(text) > 80:
        return False
    if lowered.startswith("/"):
        return False
    if any(char in text for char in "?!"):
        return False
    return bool(re.search(r"[a-zA-Z]", text))
