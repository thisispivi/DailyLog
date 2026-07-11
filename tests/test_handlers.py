import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from dailylogbot.config import Config
from dailylogbot.db import Database
from dailylogbot.handlers import BotHandlers


@dataclass
class FakeMessage:
    """Capture bot replies while exposing the minimal Telegram message interface."""

    text: str = ""
    replies: list[tuple[str, dict]] = field(default_factory=list)
    documents: list[dict] = field(default_factory=list)

    async def reply_text(self, text: str, **kwargs: object) -> None:
        """Record a text reply and the keyboard supplied with it."""
        self.replies.append((text, dict(kwargs)))

    async def reply_document(self, **kwargs: object) -> None:
        """Record an uploaded document request for export-flow assertions."""
        self.documents.append(dict(kwargs))


@dataclass
class FakeChat:
    """Capture upload status actions made before an export document is sent."""

    actions: list[object] = field(default_factory=list)

    async def send_action(self, action: object) -> None:
        """Record one requested chat action."""
        self.actions.append(action)


@dataclass
class FakeUpdate:
    """Supply the subset of Telegram update fields used by BotHandlers."""

    effective_message: FakeMessage
    effective_user: object = field(default_factory=lambda: SimpleNamespace(id=123, language_code="en"))
    effective_chat: FakeChat = field(default_factory=FakeChat)


def _handlers(path: Path) -> BotHandlers:
    """Create a handler group configured for deterministic isolated test storage."""
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


def test_guided_workflows_use_emoji_buttons_and_lock_open_activity(tmp_path) -> None:
    """Complete meal, training, and repeated sleep flows while proving the activity lock."""
    async def scenario() -> None:
        """Run complete guided flows, including two sleep sessions in one local day."""
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage())

        update.effective_message.text = "🍽 Add meal"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("🍽 Step 1 of 2")

        update.effective_message.text = "🍳 Breakfast"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("🍽 Step 2 of 2")

        update.effective_message.text = "eggs 150g and toast"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("✅ Saved:\n#")

        update.effective_message.text = "🏃 Start training"
        await handlers.message(update, context)
        update.effective_message.text = "🎾 Tennis"
        await handlers.message(update, context)
        assert handlers.db.get_open_activity(123) is not None
        assert update.effective_message.replies[-1][0].startswith("▶️ Started:")

        update.effective_message.text = "🍽 Add meal"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("⚠️ An activity is open.")

        update.effective_message.text = "⏹ End training"
        await handlers.message(update, context)
        assert handlers.db.get_open_activity(123) is None
        assert update.effective_message.replies[-1][0].startswith("⏹ Ended:")

        update.effective_message.text = "😴 Start sleep"
        await handlers.message(update, context)
        update.effective_message.text = "⏹ End sleep"
        await handlers.message(update, context)
        update.effective_message.text = "😴 Start sleep"
        await handlers.message(update, context)
        update.effective_message.text = "⏹ End sleep"
        await handlers.message(update, context)
        assert len([entry for entry in handlers.db.list_entries(123) if entry.kind == "sleep"]) == 2

    asyncio.run(scenario())


def test_export_wizard_sends_all_data_after_format_and_range_steps(tmp_path) -> None:
    """Drive the three-step emoji export wizard and assert it produces an XLSX document."""
    async def scenario() -> None:
        """Run the export interaction using the exact localized emoji button labels."""
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        handlers.db.add_entry(
            user_id=123,
            kind="meal",
            label="Lunch",
            text="🥗 salad 250g",
            start_at=handlers._now(),
        )
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage())

        update.effective_message.text = "📤 Export"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("📤 Step 1 of 3")

        update.effective_message.text = "📊 XLSX"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("📤 Step 2 of 3")

        update.effective_message.text = "🗂 All data"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("📤 Preparing your XLSX export")
        assert len(update.effective_message.documents) == 1
        assert update.effective_message.documents[0]["document"].filename.endswith(".xlsx")

    asyncio.run(scenario())


def test_start_uses_telegram_language_for_messages_and_keyboard(tmp_path) -> None:
    """Use Telegram's Italian language code for the welcome copy and first idle button."""
    async def scenario() -> None:
        """Start an Italian session and inspect the localized response boundary."""
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage(), effective_user=SimpleNamespace(id=123, language_code="it-IT"))

        await handlers.start(update, context)

        text, kwargs = update.effective_message.replies[-1]
        assert "pronto in italiano" in text
        assert kwargs["reply_markup"].keyboard[0][0].text == "🍽 Aggiungi pasto"

    asyncio.run(scenario())
