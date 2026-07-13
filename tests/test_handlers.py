import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

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


def test_export_wizard_uses_saved_document_language_without_an_extra_step(tmp_path) -> None:
    """Persist document language in Settings, then drive the shorter export wizard."""

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

        update.effective_message.text = "⚙️ Settings"
        await handlers.message(update, context)
        update.effective_message.text = "Document: Italiano"
        await handlers.message(update, context)
        assert handlers.db.get_or_create_settings(123, "en").export_locale == "it"

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


def test_compact_export_uses_the_saved_document_language(tmp_path, monkeypatch) -> None:
    """Apply the persisted report locale to the non-wizard export entry point."""

    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        handlers.db.get_or_create_settings(123, "en")
        handlers.db.update_settings(123, export_locale="it")
        handlers.db.add_entry(
            user_id=123,
            kind="meal",
            label="Lunch",
            text="pasta",
            start_at=handlers._now().replace(year=2026, month=7, day=8),
        )
        captured: dict[str, str] = {}

        async def capture_upload(*args: object) -> None:
            captured["locale"] = str(args[-1])

        monkeypatch.setattr(handlers, "_upload_export", capture_upload)
        update = FakeUpdate(FakeMessage(text="/export 2026-07-08 2026-07-08 pdf"))

        await handlers.message(update, SimpleNamespace(user_data={}))

        assert captured == {"locale": "it"}

    asyncio.run(scenario())


def test_entry_editing_separates_date_and_clock_then_returns_to_edit_options(tmp_path) -> None:
    """Keep a selected meal in edit mode after changing its date and start clock."""

    async def scenario() -> None:
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        entry = handlers.db.add_entry(
            user_id=123,
            kind="meal",
            label="Lunch",
            text="salad",
            start_at=handlers._now(),
        )
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage())

        for value in ("🗂 Manage data", "📝 Entries", "📅 Today"):
            update.effective_message.text = value
            await handlers.message(update, context)
        selection = update.effective_message.replies[-1][1]["reply_markup"].keyboard[0][0].text
        for value in (selection, "✏️ Edit"):
            update.effective_message.text = value
            await handlers.message(update, context)

        edit_buttons = [
            button.text for row in update.effective_message.replies[-1][1]["reply_markup"].keyboard for button in row
        ]
        assert "Date" in edit_buttons
        assert "Start time" in edit_buttons
        assert "End time" not in edit_buttons

        for field_name, value in (("Date", "2026-07-12"), ("Start time", "09:15")):
            update.effective_message.text = field_name
            await handlers.message(update, context)
            update.effective_message.text = value
            await handlers.message(update, context)
            assert update.effective_message.replies[-1][0].startswith("✅ Updated:")
            buttons = [
                button.text
                for row in update.effective_message.replies[-1][1]["reply_markup"].keyboard
                for button in row
            ]
            assert "Date" in buttons

        edited = handlers.db.get_entry(123, entry.id)
        assert edited is not None
        local_start = edited.start_at.astimezone(handlers.config.timezone)
        assert (local_start.date().isoformat(), local_start.strftime("%H:%M")) == ("2026-07-12", "09:15")

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
        assert "è pronto" in text
        assert kwargs["reply_markup"].keyboard[0][0].text == "🍽 Aggiungi pasto"

    asyncio.run(scenario())


def test_wizards_reject_stale_navigation_buttons_and_keep_the_expected_step(tmp_path) -> None:
    """Prevent an old reply-keyboard button from becoming saved meal text or a training name."""

    async def scenario() -> None:
        """Send stale navigation buttons during both input-only wizard states."""
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage())

        update.effective_message.text = "🍽 Add meal"
        await handlers.message(update, context)
        update.effective_message.text = "🍳 Breakfast"
        await handlers.message(update, context)
        update.effective_message.text = "📅 Today"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("Write the food and quantities")
        assert handlers.db.list_entries(123) == []

        update.effective_message.text = "/cancel"
        await handlers.cancel(update, context)
        update.effective_message.text = "🏃 Start training"
        await handlers.message(update, context)
        update.effective_message.text = "😴 Start sleep"
        await handlers.message(update, context)
        assert update.effective_message.replies[-1][0].startswith("Write an activity name")
        assert handlers.db.get_open_activity(123) is None

        update.effective_message.text = "bouldering"
        await handlers.message(update, context)
        active = handlers.db.get_open_activity(123)
        assert active is not None
        assert active.label == "bouldering"

    asyncio.run(scenario())


def test_open_activity_blocks_command_handlers_except_end_and_cancel(tmp_path) -> None:
    """Keep commands locked while an activity is open, even outside the text router."""

    async def scenario() -> None:
        """Open training, try an unrelated command, then cancel the active record."""
        handlers = _handlers(tmp_path / "dailylog.sqlite3")
        context = SimpleNamespace(user_data={})
        update = FakeUpdate(FakeMessage(text="🏃 Start training"))

        await handlers.message(update, context)
        update.effective_message.text = "🏃 Run"
        await handlers.message(update, context)
        update.effective_message.text = "/today"
        await handlers.today(update, context)
        assert update.effective_message.replies[-1][0].startswith("⚠️ An activity is already open")
        assert handlers.db.get_open_activity(123) is not None

        update.effective_message.text = "/cancel"
        await handlers.cancel(update, context)
        assert handlers.db.get_open_activity(123) is None

    asyncio.run(scenario())
