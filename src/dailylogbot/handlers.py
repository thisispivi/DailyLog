from __future__ import annotations

import logging
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import ContextTypes

from dailylogbot.config import Config
from dailylogbot.db import Database, Entry
from dailylogbot.exporters import export_pdf, export_xlsx, range_bounds
from dailylogbot.formatting import entries_block, entry_line
from dailylogbot.i18n import t
from dailylogbot.keyboards import main_keyboard
from dailylogbot.parser import ParsedAction, parse_edit_fields, parse_message

logger = logging.getLogger(__name__)


class BotHandlers:
    def __init__(self, config: Config, db: Database) -> None:
        self.config = config
        self.db = db

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        await update.effective_message.reply_text(
            t(update.effective_user.language_code, "start"),
            reply_markup=main_keyboard(update.effective_user.language_code),
        )

    async def help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        await update.effective_message.reply_text(t(update.effective_user.language_code, "help"))

    async def today(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        now = self._now()
        start_at, end_at = range_bounds(now.date(), now.date(), self.config.timezone)
        entries = self.db.list_entries_between(update.effective_user.id, start_at, end_at)
        await update.effective_message.reply_text(entries_block(entries, self.config.timezone))

    async def last(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        entry = self.db.get_last_entry(update.effective_user.id)
        if entry is None:
            await update.effective_message.reply_text(t(update.effective_user.language_code, "last_none"))
            return
        await update.effective_message.reply_text(entry_line(entry, self.config.timezone))

    async def delete_last(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        entry = self.db.get_last_entry(update.effective_user.id)
        if entry is None:
            await update.effective_message.reply_text(t(update.effective_user.language_code, "nothing_to_delete"))
            return
        self.db.delete_entry(update.effective_user.id, entry.id, self._now())
        await update.effective_message.reply_text(t(update.effective_user.language_code, "deleted_last"))

    async def delete_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        text = update.effective_message.text or ""
        parts = text.split(maxsplit=1)
        if len(parts) != 2 or not parts[1].isdigit():
            await update.effective_message.reply_text("Use: /delete 12")
            return
        deleted = self.db.delete_entry(update.effective_user.id, int(parts[1]), self._now())
        await update.effective_message.reply_text("Deleted." if deleted else "Entry not found.")

    async def export_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        action = parse_message(update.effective_message.text or "", self._now(), self.config.timezone)
        if action is None or action.action != "export":
            await update.effective_message.reply_text(t(update.effective_user.language_code, "export_prompt"))
            return
        await self._send_export(update, action)

    async def edit_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        text = update.effective_message.text or ""
        parts = text.split(maxsplit=2)
        if len(parts) < 3 or not parts[1].isdigit():
            await update.effective_message.reply_text("Use: /edit 12 label=Lunch text=pasta 120g start=2026-07-08 12:30")
            return
        entry_id = int(parts[1])
        try:
            fields = parse_edit_fields(parts[2], self.config.timezone)
        except ValueError as exc:
            await update.effective_message.reply_text(str(exc))
            return
        if not fields:
            await update.effective_message.reply_text("No editable fields found. Use label=, text=, start=, end=, kind=.")
            return
        entry = self.db.update_entry(update.effective_user.id, entry_id, fields)
        if entry is None:
            await update.effective_message.reply_text("Entry not found.")
            return
        await update.effective_message.reply_text("Updated:\n" + entry_line(entry, self.config.timezone))

    async def edit_last_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        last_entry = self.db.get_last_entry(update.effective_user.id)
        if last_entry is None:
            await update.effective_message.reply_text(t(update.effective_user.language_code, "last_none"))
            return
        text = update.effective_message.text or ""
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            await update.effective_message.reply_text("Use: /edit_last text=pasta 120g or label=Lunch")
            return
        try:
            fields = parse_edit_fields(parts[1], self.config.timezone)
        except ValueError as exc:
            await update.effective_message.reply_text(str(exc))
            return
        entry = self.db.update_entry(update.effective_user.id, last_entry.id, fields)
        if entry is None:
            await update.effective_message.reply_text("Entry not found.")
            return
        await update.effective_message.reply_text("Updated:\n" + entry_line(entry, self.config.timezone))

    async def message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        if not await self._authorize(update):
            return
        text = (update.effective_message.text or "").strip()
        language_code = update.effective_user.language_code
        button = text.lower()
        if button in {"add meal", "aggiungi pasto"}:
            await update.effective_message.reply_text(t(language_code, "meal_prompt"))
            return
        if button in {"start training", "inizia sport"}:
            await update.effective_message.reply_text(t(language_code, "training_prompt"))
            return
        if button in {"end training", "fine sport"}:
            await self._end_range(update, "training", self._now())
            return
        if button in {"start sleep", "inizia sonno"}:
            await self._start_range(update, "sleep", "Sleep", self._now())
            return
        if button in {"end sleep", "fine sonno"}:
            await self._end_range(update, "sleep", self._now())
            return
        if button in {"today", "oggi"}:
            await self.today(update, context)
            return
        if button in {"last", "ultimo"}:
            await self.last(update, context)
            return
        if button in {"xlsx", "pdf"}:
            await self._send_current_month_export(update, button)
            return
        if button in {"export", "esporta"}:
            await self._send_current_month_export(update, "xlsx")
            return

        action = parse_message(text, self._now(), self.config.timezone)
        if action is None:
            await update.effective_message.reply_text(t(language_code, "unknown"))
            return
        await self._apply_action(update, action)

    async def error(self, update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        logger.exception("Unhandled bot error", exc_info=context.error)

    async def _apply_action(self, update: Update, action: ParsedAction) -> None:
        if action.action == "add_entry":
            entry = self.db.add_entry(
                user_id=update.effective_user.id,
                kind=action.kind or "meal",
                label=action.label or "",
                text=action.text,
                start_at=action.start_at or self._now(),
                end_at=action.end_at,
            )
            await update.effective_message.reply_text("Saved:\n" + entry_line(entry, self.config.timezone))
            return
        if action.action == "start_range":
            await self._start_range(update, action.kind or "training", action.label or "", action.start_at or self._now())
            return
        if action.action == "end_range":
            await self._end_range(update, action.kind or "training", action.end_at or self._now())
            return
        if action.action == "export":
            await self._send_export(update, action)
            return
        if action.action == "prompt_training":
            await update.effective_message.reply_text(t(update.effective_user.language_code, "training_prompt"))
            return

    async def _start_range(self, update: Update, kind: str, label: str, start_at: datetime) -> None:
        active = self.db.get_active_entry(update.effective_user.id, kind)
        if active is not None:
            await update.effective_message.reply_text(f"Already open:\n{entry_line(active, self.config.timezone)}")
            return
        entry = self.db.add_entry(
            user_id=update.effective_user.id,
            kind=kind,
            label=label or kind.title(),
            text="",
            start_at=start_at,
        )
        await update.effective_message.reply_text("Started:\n" + entry_line(entry, self.config.timezone))

    async def _end_range(self, update: Update, kind: str, end_at: datetime) -> None:
        entry = self.db.end_active_entry(update.effective_user.id, kind, end_at)
        if entry is None:
            await update.effective_message.reply_text(f"No open {kind} entry.")
            return
        await update.effective_message.reply_text("Ended:\n" + entry_line(entry, self.config.timezone))

    async def _send_export(self, update: Update, action: ParsedAction) -> None:
        if action.start_date is None or action.end_date is None:
            await update.effective_message.reply_text(t(update.effective_user.language_code, "export_prompt"))
            return
        if action.end_date < action.start_date:
            await update.effective_message.reply_text("End date must be after start date.")
            return
        start_at, end_at = range_bounds(action.start_date, action.end_date, self.config.timezone)
        entries = self.db.list_entries_between(update.effective_user.id, start_at, end_at)
        await update.effective_chat.send_action(ChatAction.UPLOAD_DOCUMENT)
        fmt = action.export_format or "xlsx"
        if fmt == "pdf":
            stream = export_pdf(entries, action.start_date, action.end_date, self.config.timezone)
            suffix = "pdf"
        else:
            stream = export_xlsx(entries, action.start_date, action.end_date, self.config.timezone)
            suffix = "xlsx"
        filename = f"dailylogbot_{action.start_date.isoformat()}_{action.end_date.isoformat()}.{suffix}"
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{suffix}") as temp_file:
            temp_file.write(stream.read())
            temp_path = Path(temp_file.name)
        try:
            await update.effective_message.reply_document(document=temp_path, filename=filename)
        finally:
            temp_path.unlink(missing_ok=True)

    async def _send_current_month_export(self, update: Update, export_format: str) -> None:
        today = self._now().date()
        start_date = today.replace(day=1)
        if start_date.month == 12:
            next_month = start_date.replace(year=start_date.year + 1, month=1)
        else:
            next_month = start_date.replace(month=start_date.month + 1)
        await self._send_export(
            update,
            ParsedAction(
                action="export",
                export_format=export_format,
                start_date=start_date,
                end_date=next_month - timedelta(days=1),
            ),
        )

    async def _authorize(self, update: Update) -> bool:
        user = update.effective_user
        if user is None or user.id != self.config.allowed_user_id:
            if update.effective_message:
                await update.effective_message.reply_text(t(user.language_code if user else None, "unauthorized"))
            logger.warning("Unauthorized access attempt from user_id=%s", user.id if user else None)
            return False
        return True

    def _now(self) -> datetime:
        return datetime.now(self.config.timezone)
