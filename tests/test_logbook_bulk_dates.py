from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from dailylogbot.application.logbook import ExportPeriod, LogbookService
from dailylogbot.db import Database

TZ = ZoneInfo("Europe/Berlin")
USER_ID = 123


def test_delete_entries_in_period_uses_overlap_boundaries_and_ownership(tmp_path) -> None:
    db = Database(tmp_path / "dailylog.sqlite3")
    service = LogbookService(db)
    ending_at_start = db.add_entry(
        user_id=USER_ID,
        kind="sleep",
        label="Earlier sleep",
        text="",
        start_at=datetime(2026, 7, 7, 23, 0, tzinfo=TZ),
        end_at=datetime(2026, 7, 8, 0, 0, tzinfo=TZ),
    )
    overlapping = db.add_entry(
        user_id=USER_ID,
        kind="training",
        label="Late run",
        text="",
        start_at=datetime(2026, 7, 7, 23, 30, tzinfo=TZ),
        end_at=datetime(2026, 7, 8, 0, 30, tzinfo=TZ),
    )
    meal = db.add_entry(
        user_id=USER_ID,
        kind="meal",
        label="Breakfast",
        text="coffee",
        start_at=datetime(2026, 7, 8, 8, 0, tzinfo=TZ),
    )
    starting_at_end = db.add_entry(
        user_id=USER_ID,
        kind="meal",
        label="Next day",
        text="",
        start_at=datetime(2026, 7, 9, 0, 0, tzinfo=TZ),
    )
    other_user = db.add_entry(
        user_id=456,
        kind="meal",
        label="Other user",
        text="",
        start_at=datetime(2026, 7, 8, 12, 0, tzinfo=TZ),
    )
    deleted_at = datetime(2026, 7, 11, 12, 0, tzinfo=UTC)

    deleted_count = service.delete_entries_in_period(
        USER_ID,
        ExportPeriod(date(2026, 7, 8), date(2026, 7, 8)),
        TZ,
        deleted_at,
    )

    assert deleted_count == 2
    assert {item.record_id for item in db.list_trash(USER_ID)} == {overlapping.id, meal.id}
    assert [entry.id for entry in db.list_entries(USER_ID)] == [ending_at_start.id, starting_at_end.id]
    assert db.get_entry(456, other_user.id) is not None
    assert (
        service.delete_entries_in_period(
            USER_ID,
            ExportPeriod(date(2026, 7, 8), date(2026, 7, 8)),
            TZ,
            deleted_at,
        )
        == 0
    )


def test_recent_record_dates_are_unique_newest_first_and_half_open(tmp_path) -> None:
    db = Database(tmp_path / "dailylog.sqlite3")
    service = LogbookService(db)
    db.add_entry(
        user_id=USER_ID,
        kind="sleep",
        label="Two nights",
        text="",
        start_at=datetime(2026, 7, 7, 23, 0, tzinfo=TZ),
        end_at=datetime(2026, 7, 9, 0, 0, tzinfo=TZ),
    )
    db.add_entry(
        user_id=USER_ID,
        kind="training",
        label="Overnight hike",
        text="",
        start_at=datetime(2026, 7, 9, 23, 0, tzinfo=TZ),
        end_at=datetime(2026, 7, 10, 1, 0, tzinfo=TZ),
    )
    db.add_entry(
        user_id=USER_ID,
        kind="meal",
        label="Duplicate date",
        text="",
        start_at=datetime(2026, 7, 10, 12, 0, tzinfo=TZ),
    )
    db.add_weigh_in(USER_ID, 72_000, datetime(2026, 7, 4, 8, 0, tzinfo=TZ))
    db.add_weigh_in(USER_ID, 71_900, datetime(2026, 7, 11, 8, 0, tzinfo=TZ))
    db.add_weigh_in(USER_ID, 71_800, datetime(2026, 7, 11, 9, 0, tzinfo=TZ))

    assert service.recent_record_dates(USER_ID, "entry", TZ, limit=3) == [
        date(2026, 7, 10),
        date(2026, 7, 9),
        date(2026, 7, 8),
    ]
    assert service.recent_record_dates(USER_ID, "entry", TZ, limit=10) == [
        date(2026, 7, 10),
        date(2026, 7, 9),
        date(2026, 7, 8),
        date(2026, 7, 7),
    ]
    assert service.recent_record_dates(USER_ID, "weigh_in", TZ) == [date(2026, 7, 11), date(2026, 7, 4)]


def test_recent_record_dates_validates_record_type_and_limit(tmp_path) -> None:
    service = LogbookService(Database(tmp_path / "dailylog.sqlite3"))

    with pytest.raises(ValueError, match="record_type"):
        service.recent_record_dates(USER_ID, "trash", TZ)
    with pytest.raises(ValueError, match="limit"):
        service.recent_record_dates(USER_ID, "entry", TZ, limit=0)
