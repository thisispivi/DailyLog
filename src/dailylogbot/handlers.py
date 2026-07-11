"""Telegram transport adapter for DailyLog's guided user interactions."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime
from enum import StrEnum
from typing import cast

from telegram import InputFile, Message, Update
from telegram.constants import ChatAction
from telegram.error import TelegramError
from telegram.ext import ContextTypes

from dailylogbot.application.logbook import ExportPeriod, LogbookService
from dailylogbot.config import Config
from dailylogbot.db import ActiveActivityError, Database, Entry
from dailylogbot.exporters import export_pdf, export_xlsx
from dailylogbot.formatting import entries_block, entry_line
from dailylogbot.i18n import (
    activity_label,
    button,
    button_key,
    is_activity_suggestion,
    kind_name,
    meal_type_button_key,
    meal_type_from_label,
    t,
)
from dailylogbot.keyboards import (
    active_keyboard,
    cancel_keyboard,
    export_format_keyboard,
    export_range_keyboard,
    main_keyboard,
    meal_type_keyboard,
    training_keyboard,
)
from dailylogbot.parser import ParsedAction, parse_date_range, parse_edit_fields, parse_message

logger = logging.getLogger(__name__)

FLOW_KEY = "dailylog_flow"
MEAL_TYPE_KEY = "dailylog_meal_type"
EXPORT_FORMAT_KEY = "dailylog_export_format"


class Flow(StrEnum):
    """Name the durable wizard states stored in Telegram user data."""

    MEAL_TYPE = "meal_type"
    MEAL_TEXT = "meal_text"
    TRAINING_ACTIVITY = "training_activity"
    EXPORT_FORMAT = "export_format"
    EXPORT_RANGE = "export_range"
    EXPORT_DATES = "export_dates"


class BotHandlers:
    """Coordinate authorization, guided Telegram flows, persistence, and exports."""

    def __init__(self, config: Config, db: Database) -> None:
        """Store the immutable runtime configuration and entry repository."""
        self.config = config
        self.db = db
        self.logbook = LogbookService(db)

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Welcome an authorized user using their Telegram interface language."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        self._clear_flow(context)
        await self._message(update).reply_text(
            t(self._language(update), "start"),
            reply_markup=main_keyboard(self._language(update)),
        )

    async def help(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Explain the guided flows and the activity lock to an authorized user."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        await self._message(update).reply_text(t(self._language(update), "help"))

    async def today(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Send the authorized user's entries for the current local calendar day."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        await self._send_today(update)

    async def last(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Send the authorized user's most recently created entry."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        await self._send_last(update)

    async def delete_last(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Soft-delete the authorized user's most recently created entry."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        deleted = await self._run_sync(lambda: self.logbook.delete_latest_entry(self._user_id(update), self._now()))
        if not deleted:
            await self._message(update).reply_text(t(self._language(update), "nothing_to_delete"))
            return
        await self._message(update).reply_text(t(self._language(update), "deleted_last"))

    async def delete_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Soft-delete a specific owned entry after validating the command argument."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        parts = (self._message(update).text or "").split(maxsplit=1)
        if len(parts) != 2 or not parts[1].isdigit():
            await self._message(update).reply_text(t(self._language(update), "delete_usage"))
            return
        deleted = await self._run_sync(
            lambda: self.logbook.delete_entry(self._user_id(update), int(parts[1]), self._now())
        )
        await self._message(update).reply_text(t(self._language(update), "deleted" if deleted else "entry_not_found"))

    async def export_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Start the export wizard or run a fully specified power-user export command."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        raw_text = self._message(update).text or ""
        if len(raw_text.split()) == 1:
            await self._begin_export(update, context)
            return
        try:
            action = parse_message(raw_text, self._now(), self.config.timezone)
        except ValueError:
            action = None
        if action is None or action.action != "export":
            await self._message(update).reply_text(t(self._language(update), "export_prompt"))
            return
        await self._send_export(update, action)

    async def edit_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Edit one owned entry while enforcing data and open-activity invariants."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        parts = (self._message(update).text or "").split(maxsplit=2)
        if len(parts) < 3 or not parts[1].isdigit():
            await self._message(update).reply_text(t(self._language(update), "edit_usage"))
            return
        try:
            fields = parse_edit_fields(parts[2], self.config.timezone)
        except ValueError as exc:
            await self._message(update).reply_text(t(self._language(update), "invalid_entry", reason=str(exc)))
            return
        if not fields:
            await self._message(update).reply_text(t(self._language(update), "edit_empty"))
            return
        try:
            entry = await self._run_sync(
                lambda: self.logbook.update_entry(self._user_id(update), int(parts[1]), fields)
            )
        except (ActiveActivityError, ValueError) as exc:
            await self._message(update).reply_text(t(self._language(update), "invalid_entry", reason=str(exc)))
            return
        if entry is None:
            await self._message(update).reply_text(t(self._language(update), "entry_not_found"))
            return
        await self._message(update).reply_text(
            t(self._language(update), "updated", entry=entry_line(entry, self.config.timezone, self._language(update)))
        )

    async def edit_last_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Edit the most recently created entry owned by the authorized user."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        last_entry = await self._run_sync(lambda: self.logbook.latest_entry(self._user_id(update)))
        if last_entry is None:
            await self._message(update).reply_text(t(self._language(update), "last_none"))
            return
        parts = (self._message(update).text or "").split(maxsplit=1)
        if len(parts) < 2:
            await self._message(update).reply_text(t(self._language(update), "edit_last_usage"))
            return
        try:
            fields = parse_edit_fields(parts[1], self.config.timezone)
            entry = await self._run_sync(
                lambda: self.logbook.update_entry(self._user_id(update), last_entry.id, fields)
            )
        except (ActiveActivityError, ValueError) as exc:
            await self._message(update).reply_text(t(self._language(update), "invalid_entry", reason=str(exc)))
            return
        if not fields:
            await self._message(update).reply_text(t(self._language(update), "edit_empty"))
            return
        if entry is None:
            await self._message(update).reply_text(t(self._language(update), "entry_not_found"))
            return
        await self._message(update).reply_text(
            t(self._language(update), "updated", entry=entry_line(entry, self.config.timezone, self._language(update)))
        )

    async def cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Cancel the current wizard or delete the current open activity."""
        if not await self._authorize(update):
            return
        await self._cancel_current(update, context)

    async def end_activity(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """End whichever training or sleep activity is currently open."""
        if not await self._authorize(update):
            return
        await self._end_open_activity(update, context)

    async def message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Route plain text through the active-activity lock, wizard, or quick parser."""
        if not await self._authorize(update):
            return
        text = (self._message(update).text or "").strip()
        language_code = self._language(update)
        semantic_button = button_key(language_code, text)
        if semantic_button == "cancel":
            await self._cancel_current(update, context)
            return

        active = await self._run_sync(lambda: self.logbook.active_activity(self._user_id(update)))
        if active is not None:
            await self._handle_open_activity_input(update, context, active, text, semantic_button)
            return

        if self._flow(context) is not None:
            await self._handle_flow_input(update, context, text, semantic_button)
            return

        if semantic_button == "meal":
            await self._begin_meal(update, context)
            return
        if semantic_button == "training":
            await self._begin_training(update, context)
            return
        if semantic_button == "sleep":
            await self._start_activity(update, context, "sleep", "Sleep")
            return
        if semantic_button == "today":
            await self._send_today(update)
            return
        if semantic_button == "last":
            await self._send_last(update)
            return
        if semantic_button == "export":
            await self._begin_export(update, context)
            return

        try:
            action = parse_message(text, self._now(), self.config.timezone)
        except ValueError as exc:
            await self._message(update).reply_text(t(language_code, "invalid_entry", reason=str(exc)))
            return
        if action is None:
            await self._message(update).reply_text(t(language_code, "unknown"))
            return
        await self._apply_action(update, context, action)

    async def error(self, update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Log one unexpected failure and send a safe user-facing response.

        Args:
            update: Telegram update associated with the failed callback, if any.
            context: Framework context carrying the original exception.

        Side Effects:
            Writes an error log and may send a localized failure response.
        """
        update_id = update.update_id if isinstance(update, Update) else None
        logger.error("Unhandled bot error", extra={"update_id": update_id}, exc_info=context.error)
        if not isinstance(update, Update) or update.effective_message is None:
            return
        try:
            await update.effective_message.reply_text(t(self._language(update), "operation_failed"))
        except TelegramError:
            logger.warning("Could not send failure response", extra={"update_id": update_id})

    async def _handle_open_activity_input(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        active: Entry,
        text: str,
        semantic_button: str | None,
    ) -> None:
        """Accept only a matching end action while an activity is open."""
        matching_button = semantic_button == f"end_{active.kind}"
        try:
            action = parse_message(text, self._now(), self.config.timezone)
        except ValueError:
            action = None
        matching_text_end = action is not None and action.action == "end_range" and action.kind == active.kind
        if matching_button or matching_text_end:
            await self._end_open_activity(update, context)
            return
        await self._message(update).reply_text(
            t(self._language(update), "open_only"),
            reply_markup=active_keyboard(self._language(update), active.kind),
        )

    async def _handle_flow_input(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        text: str,
        semantic_button: str | None,
    ) -> None:
        """Advance exactly one active wizard step or keep the user on that step."""
        flow = self._flow(context)
        language_code = self._language(update)
        flow_data = self._flow_data(context)
        if flow is Flow.MEAL_TYPE:
            selected_meal_type = meal_type_from_label(language_code, text)
            if selected_meal_type is None:
                await self._message(update).reply_text(
                    t(language_code, "meal_invalid"),
                    reply_markup=meal_type_keyboard(language_code),
                )
                return
            flow_data[MEAL_TYPE_KEY] = selected_meal_type
            flow_data[FLOW_KEY] = Flow.MEAL_TEXT.value
            await self._message(update).reply_text(
                t(
                    language_code,
                    "meal_text_prompt",
                    meal_type=button(language_code, meal_type_button_key(language_code, selected_meal_type)),
                ),
                reply_markup=cancel_keyboard(language_code),
            )
            return
        if flow is Flow.MEAL_TEXT:
            meal_type = flow_data.get(MEAL_TYPE_KEY)
            if not isinstance(meal_type, str) or not text or semantic_button is not None:
                meal_label = (
                    button(language_code, meal_type_button_key(language_code, meal_type))
                    if isinstance(meal_type, str)
                    else ""
                )
                await self._message(update).reply_text(
                    t(language_code, "meal_text_invalid", meal_type=meal_label),
                    reply_markup=cancel_keyboard(language_code),
                )
                return
            try:
                entry = await self._run_sync(
                    lambda: self.logbook.create_entry(
                        user_id=self._user_id(update),
                        kind="meal",
                        label=meal_type,
                        text=text,
                        start_at=self._now(),
                    )
                )
            except ValueError as exc:
                await self._message(update).reply_text(t(language_code, "invalid_entry", reason=str(exc)))
                return
            self._clear_flow(context)
            await self._message(update).reply_text(
                t(language_code, "saved", entry=entry_line(entry, self.config.timezone, language_code)),
                reply_markup=main_keyboard(language_code),
            )
            return
        if flow is Flow.TRAINING_ACTIVITY:
            if semantic_button is not None and not is_activity_suggestion(language_code, semantic_button):
                await self._message(update).reply_text(
                    t(language_code, "activity_invalid"),
                    reply_markup=training_keyboard(language_code),
                )
                return
            label = activity_label(language_code, semantic_button) if semantic_button else text
            label = " ".join(label.strip().split())
            if not label or len(label) > 120:
                await self._message(update).reply_text(
                    t(language_code, "activity_invalid"),
                    reply_markup=training_keyboard(language_code),
                )
                return
            await self._start_activity(update, context, "training", label)
            return
        if flow is Flow.EXPORT_FORMAT:
            if semantic_button not in {"xlsx", "pdf"}:
                await self._message(update).reply_text(
                    t(language_code, "export_format_prompt"),
                    reply_markup=export_format_keyboard(language_code),
                )
                return
            flow_data[EXPORT_FORMAT_KEY] = semantic_button
            flow_data[FLOW_KEY] = Flow.EXPORT_RANGE.value
            await self._message(update).reply_text(
                t(language_code, "export_range_prompt"),
                reply_markup=export_range_keyboard(language_code),
            )
            return
        if flow is Flow.EXPORT_RANGE:
            if semantic_button == "all":
                export_format = self._export_format(context)
                self._clear_flow(context)
                await self._send_all_export(update, export_format)
                return
            if semantic_button == "range":
                flow_data[FLOW_KEY] = Flow.EXPORT_DATES.value
                await self._message(update).reply_text(
                    t(language_code, "export_dates_prompt"),
                    reply_markup=cancel_keyboard(language_code),
                )
                return
            await self._message(update).reply_text(
                t(language_code, "export_range_invalid"),
                reply_markup=export_range_keyboard(language_code),
            )
            return
        if flow is Flow.EXPORT_DATES:
            try:
                start_date, end_date = parse_date_range(text)
            except ValueError:
                await self._message(update).reply_text(t(language_code, "invalid_dates"))
                return
            if end_date < start_date:
                await self._message(update).reply_text(t(language_code, "date_order"))
                return
            export_format = self._export_format(context)
            self._clear_flow(context)
            await self._send_export(
                update,
                ParsedAction(
                    action="export",
                    export_format=export_format,
                    start_date=start_date,
                    end_date=end_date,
                ),
            )
            return
        self._clear_flow(context)
        await self._message(update).reply_text(t(language_code, "unknown"), reply_markup=main_keyboard(language_code))

    async def _apply_action(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        action: ParsedAction,
    ) -> None:
        """Apply a parsed quick entry while retaining the same safety rules as wizards."""
        language_code = self._language(update)
        if action.action == "add_entry":
            try:
                entry = await self._run_sync(
                    lambda: self.logbook.create_entry(
                        user_id=self._user_id(update),
                        kind=action.kind or "meal",
                        label=action.label or "Meal",
                        text=action.text,
                        start_at=action.start_at or self._now(),
                        end_at=action.end_at,
                    )
                )
            except ValueError as exc:
                await self._message(update).reply_text(t(language_code, "invalid_entry", reason=str(exc)))
                return
            await self._message(update).reply_text(
                t(language_code, "saved", entry=entry_line(entry, self.config.timezone, language_code)),
                reply_markup=main_keyboard(language_code),
            )
            return
        if action.action == "start_range":
            await self._start_activity(
                update, context, action.kind or "training", action.label or "Training", action.start_at
            )
            return
        if action.action == "end_range":
            await self._end_open_activity(update, context)
            return
        if action.action == "export":
            await self._send_export(update, action)
            return
        if action.action == "prompt_training":
            await self._begin_training(update, context)

    async def _begin_meal(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Open the first step of the meal wizard."""
        self._clear_flow(context)
        self._flow_data(context)[FLOW_KEY] = Flow.MEAL_TYPE.value
        await self._message(update).reply_text(
            t(self._language(update), "meal_type_prompt"),
            reply_markup=meal_type_keyboard(self._language(update)),
        )

    async def _begin_training(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Open the activity-name step of the training wizard."""
        self._clear_flow(context)
        self._flow_data(context)[FLOW_KEY] = Flow.TRAINING_ACTIVITY.value
        await self._message(update).reply_text(
            t(self._language(update), "training_prompt"),
            reply_markup=training_keyboard(self._language(update)),
        )

    async def _begin_export(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Open the format-selection step of the export wizard."""
        self._clear_flow(context)
        self._flow_data(context)[FLOW_KEY] = Flow.EXPORT_FORMAT.value
        await self._message(update).reply_text(
            t(self._language(update), "export_format_prompt"),
            reply_markup=export_format_keyboard(self._language(update)),
        )

    async def _start_activity(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        kind: str,
        label: str,
        start_at: datetime | None = None,
    ) -> None:
        """Persist a training or sleep start and restrict the keyboard to its controls."""
        language_code = self._language(update)
        open_activity = await self._run_sync(lambda: self.logbook.active_activity(self._user_id(update)))
        if open_activity is not None:
            await self._message(update).reply_text(
                t(language_code, "already_open", entry=entry_line(open_activity, self.config.timezone, language_code)),
                reply_markup=active_keyboard(language_code, open_activity.kind),
            )
            return
        try:
            entry = await self._run_sync(
                lambda: self.logbook.create_entry(
                    user_id=self._user_id(update),
                    kind=kind,
                    label=label,
                    text="",
                    start_at=start_at or self._now(),
                )
            )
        except ActiveActivityError:
            open_activity = await self._run_sync(lambda: self.logbook.active_activity(self._user_id(update)))
            if open_activity is not None:
                await self._message(update).reply_text(
                    t(
                        language_code,
                        "already_open",
                        entry=entry_line(open_activity, self.config.timezone, language_code),
                    ),
                    reply_markup=active_keyboard(language_code, open_activity.kind),
                )
            return
        except ValueError as exc:
            await self._message(update).reply_text(t(language_code, "invalid_entry", reason=str(exc)))
            return
        self._clear_flow(context)
        message_key = "sleep_started" if kind == "sleep" else "started"
        await self._message(update).reply_text(
            t(language_code, message_key, entry=entry_line(entry, self.config.timezone, language_code)),
            reply_markup=active_keyboard(language_code, kind),
        )

    async def _end_open_activity(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Close the current activity, restore the main keyboard, and confirm the result."""
        language_code = self._language(update)
        try:
            entry = await self._run_sync(
                lambda: self.logbook.finish_active_activity(self._user_id(update), self._now())
            )
        except ValueError as exc:
            await self._message(update).reply_text(t(language_code, "invalid_entry", reason=str(exc)))
            return
        if entry is None:
            await self._message(update).reply_text(t(language_code, "no_open"))
            return
        self._clear_flow(context)
        await self._message(update).reply_text(
            t(language_code, "ended", entry=entry_line(entry, self.config.timezone, language_code)),
            reply_markup=main_keyboard(language_code),
        )

    async def _cancel_current(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Cancel an open activity first, otherwise abandon the current wizard state."""
        language_code = self._language(update)
        active = await self._run_sync(lambda: self.logbook.cancel_active_activity(self._user_id(update), self._now()))
        if active is not None:
            self._clear_flow(context)
            await self._message(update).reply_text(
                t(language_code, "activity_cancelled", kind=kind_name(language_code, active.kind)),
                reply_markup=main_keyboard(language_code),
            )
            return
        if self._flow(context) is None:
            await self._message(update).reply_text(
                t(language_code, "no_flow"), reply_markup=main_keyboard(language_code)
            )
            return
        self._clear_flow(context)
        await self._message(update).reply_text(t(language_code, "cancelled"), reply_markup=main_keyboard(language_code))

    async def _send_today(self, update: Update) -> None:
        """Fetch and render the user's entries that overlap today's local bounds."""
        language_code = self._language(update)
        entries = await self._run_sync(
            lambda: self.logbook.entries_today(self._user_id(update), self._now(), self.config.timezone)
        )
        if not entries:
            await self._message(update).reply_text(t(language_code, "today_empty"))
            return
        await self._message(update).reply_text(entries_block(entries, self.config.timezone, language_code))

    async def _send_last(self, update: Update) -> None:
        """Fetch and render the authorized user's latest entry in their language."""
        language_code = self._language(update)
        entry = await self._run_sync(lambda: self.logbook.latest_entry(self._user_id(update)))
        if entry is None:
            await self._message(update).reply_text(t(language_code, "last_none"))
            return
        await self._message(update).reply_text(entry_line(entry, self.config.timezone, language_code))

    async def _send_all_export(self, update: Update, export_format: str) -> None:
        """Export every saved entry by deriving the narrowest date range that includes it."""
        export_data = await self._run_sync(
            lambda: self.logbook.all_entries_period(self._user_id(update), self.config.timezone)
        )
        if export_data is None:
            await self._message(update).reply_text(
                t(self._language(update), "export_empty"), reply_markup=main_keyboard(self._language(update))
            )
            return
        period, entries = export_data
        await self._upload_export(
            update,
            entries,
            period,
            export_format,
        )

    async def _send_export(self, update: Update, action: ParsedAction) -> None:
        """Build and upload a requested XLSX or PDF export without writing temporary files."""
        language_code = self._language(update)
        if action.start_date is None or action.end_date is None:
            await self._message(update).reply_text(t(language_code, "export_prompt"))
            return
        if action.end_date < action.start_date:
            await self._message(update).reply_text(t(language_code, "date_order"))
            return
        period = ExportPeriod(action.start_date, action.end_date)
        entries = await self._run_sync(
            lambda: self.logbook.entries_in_period(self._user_id(update), period, self.config.timezone)
        )
        if not entries:
            await self._message(update).reply_text(
                t(language_code, "export_empty"), reply_markup=main_keyboard(language_code)
            )
            return
        await self._upload_export(update, entries, period, action.export_format)

    async def _upload_export(
        self,
        update: Update,
        entries: list[Entry],
        period: ExportPeriod,
        requested_format: str | None,
    ) -> None:
        """Build a report off the event loop and upload it to Telegram.

        Args:
            update: Telegram event receiving the generated document.
            entries: Entries included in the requested report.
            period: Inclusive local-date period covered by the report.
            requested_format: Requested file format, defaulting safely to XLSX.
        """
        language_code = self._language(update)
        export_format = "pdf" if requested_format == "pdf" else "xlsx"
        await self._message(update).reply_text(t(language_code, "exporting", format=export_format.upper()))
        if update.effective_chat is not None:
            await update.effective_chat.send_action(ChatAction.UPLOAD_DOCUMENT)
        stream = await self._run_sync(
            lambda: (
                export_pdf(entries, period.start_date, period.end_date, self.config.timezone)
                if export_format == "pdf"
                else export_xlsx(entries, period.start_date, period.end_date, self.config.timezone)
            )
        )
        filename = f"dailylog_{period.start_date.isoformat()}_{period.end_date.isoformat()}.{export_format}"
        await self._message(update).reply_document(document=InputFile(stream, filename=filename))

    async def _deny_when_activity_open(self, update: Update) -> bool:
        """Tell a user to finish their activity and return whether a lock was applied."""
        active = await self._run_sync(lambda: self.logbook.active_activity(self._user_id(update)))
        if active is None:
            return False
        language_code = self._language(update)
        await self._message(update).reply_text(
            t(language_code, "already_open", entry=entry_line(active, self.config.timezone, language_code)),
            reply_markup=active_keyboard(language_code, active.kind),
        )
        return True

    async def _authorize(self, update: Update) -> bool:
        """Allow only the configured Telegram user to interact with private data."""
        user = update.effective_user
        if user is not None and user.id == self.config.allowed_user_id:
            return True
        if update.effective_message is not None:
            await update.effective_message.reply_text(t(user.language_code if user else None, "unauthorized"))
        logger.warning("Rejected update from an unauthorized Telegram user")
        return False

    def _flow_data(self, context: ContextTypes.DEFAULT_TYPE) -> dict[str, object]:
        """Return this bot's mutable Telegram user-data mapping.

        Args:
            context: Telegram callback context that owns per-user state.

        Returns:
            Mutable mapping used for this bot's wizard state.

        Raises:
            RuntimeError: If Telegram does not provide user-data storage.
        """
        if context.user_data is None:
            raise RuntimeError("Telegram user data storage must be enabled for guided workflows.")
        return cast(dict[str, object], context.user_data)

    def _flow(self, context: ContextTypes.DEFAULT_TYPE) -> Flow | None:
        """Return the current valid wizard state from user data or no active flow."""
        flow = self._flow_data(context).get(FLOW_KEY)
        if not isinstance(flow, str):
            return None
        try:
            return Flow(flow)
        except ValueError:
            return None

    def _clear_flow(self, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Remove only keys owned by this bot's guided workflow."""
        flow_data = self._flow_data(context)
        flow_data.pop(FLOW_KEY, None)
        flow_data.pop(MEAL_TYPE_KEY, None)
        flow_data.pop(EXPORT_FORMAT_KEY, None)

    def _export_format(self, context: ContextTypes.DEFAULT_TYPE) -> str:
        """Return a valid selected format, falling back safely to XLSX."""
        return "pdf" if self._flow_data(context).get(EXPORT_FORMAT_KEY) == "pdf" else "xlsx"

    def _language(self, update: Update) -> str | None:
        """Read the current user's Telegram language code when it is available."""
        return update.effective_user.language_code if update.effective_user is not None else None

    def _user_id(self, update: Update) -> int:
        """Return the authorized user's id after public entry points have checked access."""
        if update.effective_user is None:
            raise RuntimeError("An authorized update must include an effective user.")
        return update.effective_user.id

    def _message(self, update: Update) -> Message:
        """Return the effective message required by this text-command bot.

        Args:
            update: Telegram update expected to contain a message.

        Returns:
            The effective Telegram message.

        Raises:
            RuntimeError: If the update has no message payload.
        """
        if update.effective_message is None:
            raise RuntimeError("This handler requires an effective Telegram message.")
        return update.effective_message

    def _now(self) -> datetime:
        """Return the current datetime in the configured user-facing timezone."""
        return datetime.now(self.config.timezone)

    async def _run_sync[T](self, operation: Callable[[], T]) -> T:
        """Run blocking persistence or report work in the default worker pool.

        Args:
            operation: Synchronous operation with no Telegram framework calls.

        Returns:
            Value returned by the completed operation.
        """
        return await asyncio.to_thread(operation)
