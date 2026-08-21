import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from dailylogbot.config import Config
from dailylogbot.db import Database
from dailylogbot.handlers import BotHandlers

TZ = ZoneInfo("Europe/Berlin")
NOW = datetime(2026, 8, 21, 14, 0, tzinfo=TZ)


@dataclass
class FakeMessage:
    """Capture replies and reply keyboards from the covered interactions."""

    text: str = ""
    replies: list[tuple[str, dict[str, object]]] = field(default_factory=list)

    async def reply_text(self, text: str, **kwargs: object) -> None:
        """Record one text response."""
        self.replies.append((text, kwargs))


@dataclass
class FakeUpdate:
    """Expose the update attributes consumed by the handlers."""

    effective_message: FakeMessage
    effective_user: object = field(default_factory=lambda: SimpleNamespace(id=123, language_code="en"))
    effective_chat: object | None = None


def _handlers(path: Path) -> BotHandlers:
    """Create handlers with isolated persistence for one UX scenario."""
    return BotHandlers(
        Config(
            bot_token="123456:token",
            allowed_user_id=123,
            timezone_name="Europe/Berlin",
            database_path=path,
            log_level="INFO",
        ),
        Database(path),
    )


def test_log_past_saves_meals_and_completed_activities_at_the_original_times(tmp_path, monkeypatch) -> None:
    """Backfill common record types without creating-now and editing afterward."""

    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        monkeypatch.setattr(handlers, "_now", lambda: NOW)
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage())

        for value in (
            "🕰 Log past",
            "2026-08-19 12:30",
            "🍽 Meal",
            "🥗 Lunch",
            "pasta 120g",
        ):
            update.effective_message.text = value
            await handlers.message(update, context)

        meal = handlers.db.list_entries(123)[0]
        assert meal.start_at.astimezone(TZ) == datetime(2026, 8, 19, 12, 30, tzinfo=TZ)
        assert (meal.kind, meal.label, meal.text) == ("meal", "Lunch", "pasta 120g")

        for value in (
            "🕰 Log past",
            "2026-08-18 23:00",
            "😴 Sleep",
            "07:15",
        ):
            update.effective_message.text = value
            await handlers.message(update, context)

        sleep = next(entry for entry in handlers.db.list_entries(123) if entry.kind == "sleep")
        assert sleep.start_at.astimezone(TZ) == datetime(2026, 8, 18, 23, 0, tzinfo=TZ)
        assert sleep.end_at is not None
        assert sleep.end_at.astimezone(TZ) == datetime(2026, 8, 19, 7, 15, tzinfo=TZ)
        assert handlers.db.get_open_activity(123) is None

        for value in (
            "🕰 Log past",
            "2026-08-20 18:00",
            "🏃 Training",
            "🎾 Tennis",
            "19:30",
        ):
            update.effective_message.text = value
            await handlers.message(update, context)

        training = next(entry for entry in handlers.db.list_entries(123) if entry.kind == "training")
        assert training.label == "Tennis"
        assert training.end_at is not None
        assert training.end_at.astimezone(TZ) == datetime(2026, 8, 20, 19, 30, tzinfo=TZ)

        for value in ("🕰 Log past", "2026-08-20 07:00", "⚖️ Weigh in", "72.4"):
            update.effective_message.text = value
            await handlers.message(update, context)

        weigh_in = handlers.db.list_weigh_ins(123)[0]
        assert weigh_in.weight_grams == 72_400
        assert weigh_in.recorded_at.astimezone(TZ) == datetime(2026, 8, 20, 7, 0, tzinfo=TZ)

    asyncio.run(scenario())


def test_log_past_rejects_future_timestamps_without_losing_the_flow(tmp_path, monkeypatch) -> None:
    """Keep the timestamp step active after future or malformed input."""

    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        monkeypatch.setattr(handlers, "_now", lambda: NOW)
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage(text="🕰 Log past"))

        await handlers.message(update, context)
        for value in ("tomorrow", "2026-08-22 10:00"):
            update.effective_message.text = value
            await handlers.message(update, context)

        assert "future" in update.effective_message.replies[-1][0]
        update.effective_message.text = "2026-08-20 10:00"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0] == "What would you like to add at that time?"

    asyncio.run(scenario())


def test_quick_edit_lists_all_record_types_and_opens_fields_immediately(tmp_path) -> None:
    """Skip category, date, and action screens when correcting a recent record."""

    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        handlers.db.add_entry(
            user_id=123,
            kind="meal",
            label="Lunch",
            text="salad",
            start_at=NOW,
        )
        weigh_in = handlers.db.add_weigh_in(123, 72_400, NOW)
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage(text="✏️ Quick edit"))

        await handlers.message(update, context)
        keyboard = update.effective_message.replies[-1][1]["reply_markup"]
        labels = [button.text for row in keyboard.keyboard for button in row]
        assert any(label.startswith("E#") for label in labels)
        weight_label = next(label for label in labels if label.startswith("W#"))

        for value in (weight_label, "Weight", "71.8"):
            update.effective_message.text = value
            await handlers.message(update, context)

        edited = handlers.db.get_weigh_in(123, weigh_in.id)
        assert edited is not None
        assert edited.weight_grams == 71_800
        assert update.effective_message.replies[-1][0].startswith("✅ Updated:")

    asyncio.run(scenario())
