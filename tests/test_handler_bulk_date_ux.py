import asyncio
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from dailylogbot.config import Config
from dailylogbot.db import Database
from dailylogbot.handlers import BotHandlers

USER_ID = 123
TZ = ZoneInfo("Europe/Berlin")
NOW = datetime(2026, 7, 11, 12, 0, tzinfo=TZ)


@dataclass
class FakeMessage:
    """Capture handler replies and their Telegram reply keyboards."""

    text: str = ""
    replies: list[tuple[str, dict]] = field(default_factory=list)

    async def reply_text(self, text: str, **kwargs: object) -> None:
        self.replies.append((text, dict(kwargs)))


@dataclass
class FakeUpdate:
    """Expose the Telegram update fields used by the covered handlers."""

    effective_message: FakeMessage
    effective_user: object = field(default_factory=lambda: SimpleNamespace(id=USER_ID, language_code="en"))
    effective_chat: object = field(default_factory=SimpleNamespace)


def _handlers(path: Path) -> BotHandlers:
    return BotHandlers(
        Config(
            bot_token="123456:token",
            allowed_user_id=USER_ID,
            timezone_name="Europe/Berlin",
            database_path=path,
            log_level="INFO",
        ),
        Database(path),
    )


def _at_noon(value: date) -> datetime:
    return datetime(value.year, value.month, value.day, 12, 0, tzinfo=TZ)


def _keyboard_texts(message: FakeMessage) -> list[str]:
    keyboard = message.replies[-1][1]["reply_markup"].keyboard
    return [button.text for row in keyboard for button in row]


def test_delete_day_command_confirms_count_before_soft_deleting_only_that_days_entries(tmp_path, monkeypatch) -> None:
    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        monkeypatch.setattr(handlers, "_now", lambda: NOW)
        before = handlers.db.add_entry(
            user_id=USER_ID,
            kind="meal",
            label="Previous day",
            text="",
            start_at=datetime(2026, 7, 7, 23, 0, tzinfo=TZ),
        )
        breakfast = handlers.db.add_entry(
            user_id=USER_ID,
            kind="meal",
            label="Breakfast",
            text="porridge",
            start_at=datetime(2026, 7, 8, 8, 0, tzinfo=TZ),
        )
        training = handlers.db.add_entry(
            user_id=USER_ID,
            kind="training",
            label="Run",
            text="",
            start_at=datetime(2026, 7, 8, 18, 0, tzinfo=TZ),
            end_at=datetime(2026, 7, 8, 19, 0, tzinfo=TZ),
        )
        after = handlers.db.add_entry(
            user_id=USER_ID,
            kind="meal",
            label="Next day",
            text="",
            start_at=datetime(2026, 7, 9, 0, 0, tzinfo=TZ),
        )
        weigh_in = handlers.db.add_weigh_in(
            USER_ID,
            72_400,
            datetime(2026, 7, 8, 7, 30, tzinfo=TZ),
        )
        context = SimpleNamespace(user_data={})
        message = FakeMessage(text="/delete_day 2026-07-08")
        update = FakeUpdate(message)

        await handlers.delete_day_command(update, context)

        confirmation = message.replies[-1][0]
        assert "2026-07-08" in confirmation
        assert "Entries affected: 2" in confirmation
        assert "Weigh-ins will not be changed" in confirmation
        assert "🗑 Yes, delete" in _keyboard_texts(message)
        assert {entry.id for entry in handlers.db.list_entries(USER_ID)} == {
            before.id,
            breakfast.id,
            training.id,
            after.id,
        }
        assert handlers.db.list_trash(USER_ID) == []

        message.text = "🗑 Yes, delete"
        await handlers.message(update, context)

        assert message.replies[-1][0] == "🗑 Entries moved to Trash: 2 (2026-07-08)."
        assert {entry.id for entry in handlers.db.list_entries(USER_ID)} == {before.id, after.id}
        assert handlers.db.get_weigh_in(USER_ID, weigh_in.id) is not None
        trash = handlers.db.list_trash(USER_ID)
        assert {item.record_id for item in trash} == {breakfast.id, training.id}
        assert {item.record_type for item in trash} == {"entry"}

    asyncio.run(scenario())


def test_date_pickers_offer_today_and_eight_type_specific_recent_dates_and_accept_older_typed_dates(
    tmp_path, monkeypatch
) -> None:
    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        monkeypatch.setattr(handlers, "_now", lambda: NOW)
        today = NOW.date()
        entry_dates = [today - timedelta(days=offset) for offset in range(1, 11)]
        weigh_in_dates = [today - timedelta(days=offset) for offset in range(11, 21)]
        old_entry_date = date(2026, 5, 15)

        entries_by_date = {}
        for value in [today, *entry_dates, old_entry_date]:
            entries_by_date[value] = handlers.db.add_entry(
                user_id=USER_ID,
                kind="meal",
                label=f"Entry {value.isoformat()}",
                text="",
                start_at=_at_noon(value),
            )
        handlers.db.add_entry(
            user_id=USER_ID,
            kind="meal",
            label="Duplicate recent entry date",
            text="",
            start_at=_at_noon(entry_dates[0]) + timedelta(hours=1),
        )

        weigh_ins_by_date = {}
        for index, value in enumerate([today, *weigh_in_dates]):
            weigh_ins_by_date[value] = handlers.db.add_weigh_in(
                USER_ID,
                70_000 + index,
                _at_noon(value),
            )
        handlers.db.add_weigh_in(USER_ID, 69_900, _at_noon(weigh_in_dates[0]) + timedelta(hours=1))

        entry_picker = ["📅 Today", *(value.isoformat() for value in entry_dates[:8]), "✖ Cancel"]
        weigh_in_picker = ["📅 Today", *(value.isoformat() for value in weigh_in_dates[:8]), "✖ Cancel"]
        context = SimpleNamespace(user_data={})
        message = FakeMessage(text="/delete_day")
        update = FakeUpdate(message)

        await handlers.delete_day_command(update, context)
        assert _keyboard_texts(message) == entry_picker

        message.text = old_entry_date.isoformat()
        await handlers.message(update, context)
        assert "Entries affected: 1" in message.replies[-1][0]
        assert handlers.db.list_trash(USER_ID) == []

        message.text = "◀ Back"
        await handlers.message(update, context)
        assert _keyboard_texts(message) == entry_picker
        assert handlers.db.list_trash(USER_ID) == []

        message.text = "✖ Cancel"
        await handlers.message(update, context)
        message.text = "🗂 Manage data"
        await handlers.message(update, context)
        message.text = "📝 Entries"
        await handlers.message(update, context)
        assert _keyboard_texts(message) == entry_picker

        message.text = old_entry_date.isoformat()
        await handlers.message(update, context)
        assert message.replies[-1][0] == "Select a record below."
        expected_id = entries_by_date[old_entry_date].id
        assert any(label.startswith(f"#{expected_id} · Entry 2026-05-15") for label in _keyboard_texts(message))

        message.text = "✖ Cancel"
        await handlers.message(update, context)
        message.text = "🗂 Manage data"
        await handlers.message(update, context)
        message.text = "⚖️ Weigh-ins"
        await handlers.message(update, context)
        assert _keyboard_texts(message) == weigh_in_picker

        typed_weigh_in_date = weigh_in_dates[-1]
        message.text = typed_weigh_in_date.isoformat()
        await handlers.message(update, context)
        assert message.replies[-1][0] == "Select a record below."
        expected_id = weigh_ins_by_date[typed_weigh_in_date].id
        assert any(label.startswith(f"#{expected_id} · ⚖️") for label in _keyboard_texts(message))

    asyncio.run(scenario())


def test_delete_day_rejects_invalid_arguments_and_empty_dates_can_be_cancelled(tmp_path, monkeypatch) -> None:
    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        monkeypatch.setattr(handlers, "_now", lambda: NOW)
        context = SimpleNamespace(user_data={})
        message = FakeMessage()
        update = FakeUpdate(message)

        for invalid_command in ("/delete_day not-a-date", "/delete_day 2026-07-08 extra"):
            message.text = invalid_command
            await handlers.delete_day_command(update, context)
            assert message.replies[-1][0] == ("Use: /delete_day 2026-07-08, or /delete_day to choose a date.")

        message.text = "/delete_day 2026-01-01"
        await handlers.delete_day_command(update, context)
        assert message.replies[-1][0] == "📭 No entries found for 2026-01-01. Choose another date."
        assert _keyboard_texts(message) == ["📅 Today", "✖ Cancel"]

        message.text = "✖ Cancel"
        await handlers.message(update, context)
        assert message.replies[-1][0] == "✖ Cancelled."
        assert context.user_data == {}

    asyncio.run(scenario())
