from datetime import date, datetime
from zoneinfo import ZoneInfo

from dailylogbot.parser import parse_date_range, parse_edit_fields, parse_message


TZ = ZoneInfo("Europe/Berlin")
NOW = datetime(2026, 7, 8, 9, 30, tzinfo=TZ)


def test_parse_meal() -> None:
    """Parse a compact English meal entry with its free-text details."""
    action = parse_message("lunch pasta 120g chicken 200g", NOW, TZ)
    assert action is not None
    assert action.action == "add_entry"
    assert action.kind == "meal"
    assert action.label == "Lunch"
    assert action.text == "pasta 120g chicken 200g"


def test_parse_italian_meal() -> None:
    """Parse the Italian breakfast alias into the shared canonical meal type."""
    action = parse_message("colazione uova 150g pane 80g", NOW, TZ)
    assert action is not None
    assert action.kind == "meal"
    assert action.label == "Breakfast"


def test_parse_training_start() -> None:
    """Treat a short free-text activity as a training start."""
    action = parse_message("tennis", NOW, TZ)
    assert action is not None
    assert action.action == "start_range"
    assert action.kind == "training"
    assert action.label == "tennis"


def test_parse_sleep_cross_midnight() -> None:
    """Place a sleep range starting after midnight on the prior calendar day."""
    action = parse_message("sleep 23:30-07:10", NOW, TZ)
    assert action is not None
    assert action.kind == "sleep"
    assert action.start_at == datetime(2026, 7, 7, 23, 30, tzinfo=TZ)
    assert action.end_at == datetime(2026, 7, 8, 7, 10, tzinfo=TZ)


def test_parse_export() -> None:
    """Parse an explicit PDF export range."""
    action = parse_message("/export 2026-07-01 2026-07-31 pdf", NOW, TZ)
    assert action is not None
    assert action.action == "export"
    assert action.export_format == "pdf"


def test_parse_export_defaults_to_current_month() -> None:
    """Default a compact export command to the month containing the current time."""
    action = parse_message("/export pdf", NOW, TZ)
    assert action is not None
    assert action.action == "export"
    assert action.export_format == "pdf"
    assert action.start_date.isoformat() == "2026-07-01"
    assert action.end_date.isoformat() == "2026-07-31"


def test_parse_edit_fields() -> None:
    """Parse multiple bounded edit fields without consuming the next assignment."""
    fields = parse_edit_fields("label=Lunch text=pasta 120g chicken 200g start=2026-07-08 12:30", TZ)
    assert fields["label"] == "Lunch"
    assert fields["text"] == "pasta 120g chicken 200g"
    assert fields["start_at"] == datetime(2026, 7, 8, 12, 30, tzinfo=TZ)


def test_parse_date_range() -> None:
    """Parse the strict ISO input shown in the export wizard's final step."""
    assert parse_date_range("2026-07-01 2026-07-31") == (date(2026, 7, 1), date(2026, 7, 31))
