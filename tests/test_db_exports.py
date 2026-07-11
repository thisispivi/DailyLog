from datetime import date, datetime
from zoneinfo import ZoneInfo

from openpyxl import load_workbook

from dailylogbot.db import ActiveActivityError, Database
from dailylogbot.exporters import export_pdf, export_xlsx, range_bounds


TZ = ZoneInfo("Europe/Berlin")


def test_database_and_exports(tmp_path) -> None:
    """Persist varied entries and create valid XLSX and PDF report streams."""
    db = Database(tmp_path / "test.sqlite3")
    user_id = 123
    db.add_entry(
        user_id=user_id,
        kind="meal",
        label="Breakfast",
        text="eggs 150g",
        start_at=datetime(2026, 7, 8, 8, 0, tzinfo=TZ),
    )
    db.add_entry(
        user_id=user_id,
        kind="training",
        label="tennis",
        text="",
        start_at=datetime(2026, 7, 8, 18, 0, tzinfo=TZ),
        end_at=datetime(2026, 7, 8, 19, 30, tzinfo=TZ),
    )
    start_at, end_at = range_bounds(date(2026, 7, 8), date(2026, 7, 8), TZ)
    entries = db.list_entries_between(user_id, start_at, end_at)

    assert len(entries) == 2
    assert export_xlsx(entries, date(2026, 7, 8), date(2026, 7, 8), TZ).getbuffer().nbytes > 0
    assert export_pdf(entries, date(2026, 7, 8), date(2026, 7, 8), TZ).getvalue().startswith(b"%PDF")


def test_xlsx_export_uses_new_summary_and_safe_detail_layout(tmp_path) -> None:
    """Verify the redesigned XLSX report contains summary cards and literal user text."""
    db = Database(tmp_path / "test.sqlite3")
    user_id = 123
    db.add_entry(
        user_id=user_id,
        kind="meal",
        label="Breakfast",
        text="=HYPERLINK(\"https://unsafe.example\")",
        start_at=datetime(2026, 7, 8, 8, 0, tzinfo=TZ),
    )
    start_at, end_at = range_bounds(date(2026, 7, 8), date(2026, 7, 8), TZ)
    entries = db.list_entries_between(user_id, start_at, end_at)
    output = tmp_path / "dailylog.xlsx"
    output.write_bytes(export_xlsx(entries, date(2026, 7, 8), date(2026, 7, 8), TZ).getvalue())
    workbook = load_workbook(output)
    sheet = workbook["2026-07"]

    assert sheet["A1"].value == "DAILY LOG"
    assert sheet["A5"].value == 1
    assert sheet["A8"].value == "DATE"
    assert sheet["B10"].value == "Meal"
    assert sheet["G10"].value == "'=HYPERLINK(\"https://unsafe.example\")"
    assert sheet["G10"].data_type == "s"


def test_database_prevents_overlapping_open_activities(tmp_path) -> None:
    """Enforce exactly one unfinished training or sleep activity for every user."""
    db = Database(tmp_path / "test.sqlite3")
    db.add_entry(
        user_id=123,
        kind="training",
        label="Run",
        text="",
        start_at=datetime(2026, 7, 8, 8, 0, tzinfo=TZ),
    )

    try:
        db.add_entry(
            user_id=123,
            kind="sleep",
            label="Sleep",
            text="",
            start_at=datetime(2026, 7, 8, 22, 0, tzinfo=TZ),
        )
    except ActiveActivityError:
        pass
    else:
        raise AssertionError("A second open activity must be rejected.")


def test_date_range_uses_half_open_activity_bounds(tmp_path) -> None:
    """Exclude activity ending exactly at range start while retaining a meal at that instant."""
    db = Database(tmp_path / "test.sqlite3")
    db.add_entry(
        user_id=123,
        kind="sleep",
        label="Sleep",
        text="",
        start_at=datetime(2026, 7, 7, 23, 0, tzinfo=TZ),
        end_at=datetime(2026, 7, 8, 0, 0, tzinfo=TZ),
    )
    meal = db.add_entry(
        user_id=123,
        kind="meal",
        label="Breakfast",
        text="coffee",
        start_at=datetime(2026, 7, 8, 0, 0, tzinfo=TZ),
    )
    start_at, end_at = range_bounds(date(2026, 7, 8), date(2026, 7, 8), TZ)

    assert [entry.id for entry in db.list_entries_between(123, start_at, end_at)] == [meal.id]
