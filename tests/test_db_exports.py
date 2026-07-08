from datetime import date, datetime
from zoneinfo import ZoneInfo

from openpyxl import load_workbook

from dailylogbot.db import Database
from dailylogbot.exporters import export_pdf, export_xlsx, range_bounds


TZ = ZoneInfo("Europe/Berlin")


def test_database_and_exports(tmp_path) -> None:
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
    assert export_pdf(entries, date(2026, 7, 8), date(2026, 7, 8), TZ).getbuffer().nbytes > 0


def test_xlsx_export_uses_monitor_layout(tmp_path) -> None:
    db = Database(tmp_path / "test.sqlite3")
    user_id = 123
    db.add_entry(
        user_id=user_id,
        kind="meal",
        label="Breakfast",
        text="eggs 150g",
        start_at=datetime(2026, 7, 8, 8, 0, tzinfo=TZ),
    )
    start_at, end_at = range_bounds(date(2026, 7, 8), date(2026, 7, 8), TZ)
    entries = db.list_entries_between(user_id, start_at, end_at)

    output = tmp_path / "monitor.xlsx"
    output.write_bytes(export_xlsx(entries, date(2026, 7, 8), date(2026, 7, 8), TZ).getvalue())
    workbook = load_workbook(output)
    sheet = workbook["2026-07"]

    assert sheet["A1"].value.date() == date(2026, 7, 8)
    assert "A1:C1" in {str(merged_range) for merged_range in sheet.merged_cells.ranges}
    assert sheet["A2"].value == "Colazione"
    assert sheet["B2"].value == "08:00"
    assert sheet["C2"].value == "eggs 150g"
