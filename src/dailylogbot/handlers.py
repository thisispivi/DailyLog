"""Telegram transport adapter for DailyLog's guided user interactions."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import cast

from telegram import InputFile, Message, Update
from telegram.constants import ChatAction
from telegram.error import TelegramError
from telegram.ext import ContextTypes

from dailylogbot.application.logbook import ExportPeriod, LogbookService
from dailylogbot.config import Config
from dailylogbot.db import ActiveActivityError, Database, Entry, EntryFieldValue, TrashItem, UserSettings, WeighIn
from dailylogbot.exporters import export_pdf, export_xlsx
from dailylogbot.formatting import entries_block, entry_line, weigh_in_line
from dailylogbot.i18n import (
    activity_label,
    button,
    button_key,
    is_activity_suggestion,
    kind_name,
    lang_from_code,
    meal_type_button_key,
    meal_type_from_label,
    t,
)
from dailylogbot.keyboards import (
    active_keyboard,
    cancel_keyboard,
    choose_date_keyboard,
    confirm_delete_keyboard,
    edit_fields_keyboard,
    entry_kind_keyboard,
    export_format_keyboard,
    export_language_keyboard,
    export_range_keyboard,
    main_keyboard,
    manage_keyboard,
    meal_type_keyboard,
    record_action_keyboard,
    record_list_keyboard,
    settings_keyboard,
    training_keyboard,
)
from dailylogbot.measurements import format_weight, parse_weight_grams
from dailylogbot.parser import ParsedAction, parse_date_range, parse_edit_fields, parse_local_datetime, parse_message

logger = logging.getLogger(__name__)

FLOW_KEY = "dailylog_flow"
MEAL_TYPE_KEY = "dailylog_meal_type"
EXPORT_FORMAT_KEY = "dailylog_export_format"
EXPORT_LOCALE_KEY = "dailylog_export_locale"
EXPORT_START_KEY = "dailylog_export_start"
EXPORT_END_KEY = "dailylog_export_end"
MANAGE_TYPE_KEY = "dailylog_manage_type"
MANAGE_DATE_KEY = "dailylog_manage_date"
MANAGE_RECORD_ID_KEY = "dailylog_manage_record_id"
MANAGE_EDIT_FIELD_KEY = "dailylog_manage_edit_field"
MANAGE_ITEMS_KEY = "dailylog_manage_items"
MANAGE_ALL_ITEMS_KEY = "dailylog_manage_all_items"
MANAGE_PAGE_KEY = "dailylog_manage_page"


class Flow(StrEnum):
    """Name the durable wizard states stored in Telegram user data."""

    MEAL_TYPE = "meal_type"
    MEAL_TEXT = "meal_text"
    TRAINING_ACTIVITY = "training_activity"
    EXPORT_FORMAT = "export_format"
    EXPORT_LANGUAGE = "export_language"
    EXPORT_RANGE = "export_range"
    EXPORT_DATES = "export_dates"
    WEIGH_IN = "weigh_in"
    SETTINGS = "settings"
    MANAGE_CATEGORY = "manage_category"
    MANAGE_DATE = "manage_date"
    MANAGE_LIST = "manage_list"
    MANAGE_ACTION = "manage_action"
    MANAGE_EDIT_FIELD = "manage_edit_field"
    MANAGE_EDIT_VALUE = "manage_edit_value"
    DELETE_CONFIRM = "delete_confirm"
    TRASH_LIST = "trash_list"
    TRASH_ACTION = "trash_action"


class BotHandlers:
    """Coordinate authorization, guided Telegram flows, persistence, and exports."""

    def __init__(self, config: Config, db: Database) -> None:
        """Store the immutable runtime configuration and entry repository."""
        self.config = config
        self.db = db
        self.logbook = LogbookService(db)
        self._profiles: dict[int, UserSettings] = {}

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
        entry = await self._run_sync(lambda: self.logbook.latest_entry(self._user_id(update)))
        if entry is None:
            await self._message(update).reply_text(t(self._language(update), "nothing_to_delete"))
            return
        await self._request_delete(update, context, "entry", entry.id)

    async def delete_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Soft-delete a specific owned entry after validating the command argument."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        parts = (self._message(update).text or "").split(maxsplit=1)
        if len(parts) != 2 or not parts[1].isdigit():
            await self._message(update).reply_text(t(self._language(update), "delete_usage"))
            return
        await self._request_delete(update, context, "entry", int(parts[1]))

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
        self._clear_flow(context)
        flow_data = self._flow_data(context)
        flow_data[FLOW_KEY] = Flow.EXPORT_LANGUAGE.value
        flow_data[EXPORT_FORMAT_KEY] = action.export_format or "xlsx"
        flow_data[EXPORT_START_KEY] = action.start_date
        flow_data[EXPORT_END_KEY] = action.end_date
        await self._message(update).reply_text(
            t(self._language(update), "export_language_prompt"),
            reply_markup=export_language_keyboard(self._language(update)),
        )

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

    async def weighin(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Open the guided body-weight input step."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        await self._begin_weigh_in(update, context)

    async def manage(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Open the guided record-management flow."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        await self._begin_manage(update, context)

    async def settings(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Open persisted language and display-unit settings."""
        if not await self._authorize(update) or await self._deny_when_activity_open(update):
            return
        await self._begin_settings(update, context)

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
        if semantic_button == "weigh_in":
            await self._begin_weigh_in(update, context)
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
        if semantic_button == "manage":
            await self._begin_manage(update, context)
            return
        if semantic_button == "settings":
            await self._begin_settings(update, context)
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
        """Advance one safe wizard step, retaining state after invalid input."""
        flow = self._flow(context)
        language_code = self._language(update)
        flow_data = self._flow_data(context)
        if flow is Flow.MEAL_TYPE:
            selected_meal_type = meal_type_from_label(language_code, text)
            if selected_meal_type is None:
                await self._message(update).reply_text(
                    t(language_code, "meal_invalid"), reply_markup=meal_type_keyboard(language_code)
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
                        user_id=self._user_id(update), kind="meal", label=meal_type, text=text, start_at=self._now()
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
                    t(language_code, "activity_invalid"), reply_markup=training_keyboard(language_code)
                )
                return
            label = activity_label(language_code, semantic_button) if semantic_button else text
            label = " ".join(label.strip().split())
            if not label or len(label) > 120:
                await self._message(update).reply_text(
                    t(language_code, "activity_invalid"), reply_markup=training_keyboard(language_code)
                )
                return
            await self._start_activity(update, context, "training", label)
            return
        if flow is Flow.WEIGH_IN:
            try:
                grams = parse_weight_grams(text, self._weight_unit(update))
                weigh_in = await self._run_sync(
                    lambda: self.logbook.create_weigh_in(self._user_id(update), grams, self._now())
                )
            except ValueError:
                await self._message(update).reply_text(
                    t(language_code, "weigh_in_invalid", unit=self._weight_unit(update)),
                    reply_markup=cancel_keyboard(language_code),
                )
                return
            self._clear_flow(context)
            await self._message(update).reply_text(
                t(
                    language_code,
                    "weigh_in_saved",
                    weight=format_weight(weigh_in.weight_grams, self._weight_unit(update)),
                ),
                reply_markup=main_keyboard(language_code),
            )
            return
        if flow is Flow.SETTINGS:
            if semantic_button in {"english", "italian"}:
                locale = "en" if semantic_button == "english" else "it"
                settings = await self._run_sync(
                    lambda: self.logbook.update_settings(self._user_id(update), locale=locale)
                )
                self._profiles[settings.user_id] = settings
                self._clear_flow(context)
                await self._message(update).reply_text(t(locale, "language_saved"), reply_markup=main_keyboard(locale))
                return
            if semantic_button in {"kg", "lb"}:
                settings = await self._run_sync(
                    lambda: self.logbook.update_settings(self._user_id(update), weight_unit=semantic_button)
                )
                self._profiles[settings.user_id] = settings
                self._clear_flow(context)
                await self._message(update).reply_text(
                    t(language_code, "unit_saved", unit=semantic_button), reply_markup=main_keyboard(language_code)
                )
                return
            await self._message(update).reply_text(
                t(language_code, "settings_prompt"), reply_markup=settings_keyboard(language_code)
            )
            return
        if flow is Flow.EXPORT_FORMAT:
            if semantic_button not in {"xlsx", "pdf"}:
                await self._message(update).reply_text(
                    t(language_code, "export_format_prompt"), reply_markup=export_format_keyboard(language_code)
                )
                return
            flow_data[EXPORT_FORMAT_KEY] = semantic_button
            flow_data[FLOW_KEY] = Flow.EXPORT_LANGUAGE.value
            await self._message(update).reply_text(
                t(language_code, "export_language_prompt"), reply_markup=export_language_keyboard(language_code)
            )
            return
        if flow is Flow.EXPORT_LANGUAGE:
            if semantic_button not in {"english", "italian"}:
                await self._message(update).reply_text(
                    t(language_code, "export_language_prompt"), reply_markup=export_language_keyboard(language_code)
                )
                return
            report_locale = "en" if semantic_button == "english" else "it"
            flow_data[EXPORT_LOCALE_KEY] = report_locale
            start_value = flow_data.get(EXPORT_START_KEY)
            end_value = flow_data.get(EXPORT_END_KEY)
            if isinstance(start_value, date) and isinstance(end_value, date):
                export_format = self._export_format(context)
                self._clear_flow(context)
                await self._send_export(
                    update,
                    ParsedAction(
                        action="export", export_format=export_format, start_date=start_value, end_date=end_value
                    ),
                    report_locale,
                )
                return
            flow_data[FLOW_KEY] = Flow.EXPORT_RANGE.value
            await self._message(update).reply_text(
                t(language_code, "export_range_prompt"), reply_markup=export_range_keyboard(language_code)
            )
            return
        if flow is Flow.EXPORT_RANGE:
            if semantic_button == "all":
                export_format = self._export_format(context)
                report_locale = self._export_locale(context)
                self._clear_flow(context)
                await self._send_all_export(update, export_format, report_locale)
                return
            if semantic_button == "range":
                flow_data[FLOW_KEY] = Flow.EXPORT_DATES.value
                await self._message(update).reply_text(
                    t(language_code, "export_dates_prompt"), reply_markup=cancel_keyboard(language_code)
                )
                return
            await self._message(update).reply_text(
                t(language_code, "export_range_invalid"), reply_markup=export_range_keyboard(language_code)
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
            report_locale = self._export_locale(context)
            self._clear_flow(context)
            await self._send_export(
                update,
                ParsedAction(action="export", export_format=export_format, start_date=start_date, end_date=end_date),
                report_locale,
            )
            return
        if flow is Flow.MANAGE_CATEGORY:
            if semantic_button in {"entries", "weigh_ins"}:
                flow_data[MANAGE_TYPE_KEY] = "entry" if semantic_button == "entries" else "weigh_in"
                flow_data[FLOW_KEY] = Flow.MANAGE_DATE.value
                await self._message(update).reply_text(
                    t(language_code, "manage_date_prompt"), reply_markup=choose_date_keyboard(language_code)
                )
                return
            if semantic_button == "trash":
                await self._show_trash(update, context)
                return
            await self._message(update).reply_text(
                t(language_code, "manage_prompt"), reply_markup=manage_keyboard(language_code)
            )
            return
        if flow is Flow.MANAGE_DATE:
            selected_date = self._now().date() if semantic_button == "today" else self._parse_manage_date(text)
            if selected_date is None:
                await self._message(update).reply_text(
                    t(language_code, "invalid_manage_date"), reply_markup=choose_date_keyboard(language_code)
                )
                return
            await self._show_manage_records(update, context, selected_date)
            return
        if flow is Flow.MANAGE_LIST:
            if semantic_button == "back":
                flow_data[FLOW_KEY] = Flow.MANAGE_DATE.value
                await self._message(update).reply_text(
                    t(language_code, "manage_date_prompt"), reply_markup=choose_date_keyboard(language_code)
                )
                return
            if text in {"◀", "▶"}:
                await self._show_manage_page(update, context, -1 if text == "◀" else 1)
                return
            record_id = self._selected_record_id(text, flow_data)
            if record_id is None:
                await self._message(update).reply_text(t(language_code, "manage_select"))
                return
            flow_data[MANAGE_RECORD_ID_KEY] = record_id
            flow_data[FLOW_KEY] = Flow.MANAGE_ACTION.value
            record = await self._current_record(update, flow_data)
            if record is None:
                await self._message(update).reply_text(t(language_code, "record_unavailable"))
                return
            await self._message(update).reply_text(
                t(language_code, "manage_item", record=self._record_line(record, update)),
                reply_markup=record_action_keyboard(language_code),
            )
            return
        if flow is Flow.MANAGE_ACTION:
            if semantic_button == "back":
                saved_date = flow_data.get(MANAGE_DATE_KEY)
                if isinstance(saved_date, date):
                    await self._show_manage_records(update, context, saved_date)
                else:
                    await self._begin_manage(update, context)
                return
            if semantic_button == "delete":
                record_type = flow_data.get(MANAGE_TYPE_KEY)
                selected_record_id = flow_data.get(MANAGE_RECORD_ID_KEY)
                if isinstance(record_type, str) and isinstance(selected_record_id, int):
                    await self._request_delete(update, context, record_type, selected_record_id)
                    return
            if semantic_button == "edit":
                record_type = flow_data.get(MANAGE_TYPE_KEY)
                if isinstance(record_type, str):
                    flow_data[FLOW_KEY] = Flow.MANAGE_EDIT_FIELD.value
                    await self._message(update).reply_text(
                        t(language_code, "manage_edit_prompt"),
                        reply_markup=edit_fields_keyboard(language_code, record_type),
                    )
                    return
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        if flow is Flow.MANAGE_EDIT_FIELD:
            if semantic_button == "back":
                flow_data[FLOW_KEY] = Flow.MANAGE_ACTION.value
                await self._message(update).reply_text(
                    t(language_code, "manage_item", record=""), reply_markup=record_action_keyboard(language_code)
                )
                return
            record_type = flow_data.get(MANAGE_TYPE_KEY)
            allowed_fields = (
                {"value", "recorded_at"} if record_type == "weigh_in" else {"type", "label", "details", "start", "end"}
            )
            if semantic_button not in allowed_fields:
                await self._message(update).reply_text(
                    t(language_code, "manage_edit_prompt"),
                    reply_markup=edit_fields_keyboard(language_code, str(record_type)),
                )
                return
            flow_data[MANAGE_EDIT_FIELD_KEY] = semantic_button
            flow_data[FLOW_KEY] = Flow.MANAGE_EDIT_VALUE.value
            if semantic_button == "type":
                await self._message(update).reply_text(
                    t(language_code, "manage_edit_value", field=button(language_code, semantic_button)),
                    reply_markup=entry_kind_keyboard(language_code),
                )
            else:
                await self._message(update).reply_text(
                    t(language_code, "manage_edit_value", field=button(language_code, semantic_button)),
                    reply_markup=cancel_keyboard(language_code),
                )
            return
        if flow is Flow.MANAGE_EDIT_VALUE:
            await self._save_management_edit(update, context, text, semantic_button)
            return
        if flow is Flow.DELETE_CONFIRM:
            if semantic_button == "confirm_delete":
                await self._confirm_delete(update, context)
                return
            if semantic_button == "back":
                flow_data[FLOW_KEY] = Flow.MANAGE_ACTION.value
                await self._message(update).reply_text(
                    t(language_code, "manage_prompt"), reply_markup=record_action_keyboard(language_code)
                )
                return
            await self._message(update).reply_text(
                t(language_code, "manage_delete_confirm", record=""),
                reply_markup=confirm_delete_keyboard(language_code),
            )
            return
        if flow is Flow.TRASH_LIST:
            if semantic_button == "back":
                await self._begin_manage(update, context)
                return
            if text in {"◀", "▶"}:
                await self._show_trash_page(update, context, -1 if text == "◀" else 1)
                return
            parsed = self._selected_trash_record(text, flow_data)
            if parsed is None:
                await self._message(update).reply_text(t(language_code, "trash_prompt"))
                return
            record_type, record_id = parsed
            flow_data[MANAGE_TYPE_KEY] = record_type
            flow_data[MANAGE_RECORD_ID_KEY] = record_id
            flow_data[FLOW_KEY] = Flow.TRASH_ACTION.value
            await self._message(update).reply_text(
                t(language_code, "trash_prompt"), reply_markup=record_action_keyboard(language_code, deleted=True)
            )
            return
        if flow is Flow.TRASH_ACTION:
            if semantic_button == "restore":
                await self._restore_selected_record(update, context)
                return
            if semantic_button == "back":
                await self._show_trash(update, context)
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

    async def _begin_weigh_in(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Prompt for one body-weight value in the user's saved display unit."""
        self._clear_flow(context)
        self._flow_data(context)[FLOW_KEY] = Flow.WEIGH_IN.value
        language_code = self._language(update)
        await self._message(update).reply_text(
            t(language_code, "weigh_in_prompt", unit=self._weight_unit(update)),
            reply_markup=cancel_keyboard(language_code),
        )

    async def _begin_settings(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Show persisted language and body-weight unit controls."""
        self._clear_flow(context)
        self._flow_data(context)[FLOW_KEY] = Flow.SETTINGS.value
        language_code = self._language(update)
        await self._message(update).reply_text(
            t(language_code, "settings_prompt"), reply_markup=settings_keyboard(language_code)
        )

    async def _begin_manage(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Show record category choices for the correction flow."""
        self._clear_flow(context)
        self._flow_data(context)[FLOW_KEY] = Flow.MANAGE_CATEGORY.value
        language_code = self._language(update)
        await self._message(update).reply_text(
            t(language_code, "manage_prompt"), reply_markup=manage_keyboard(language_code)
        )

    async def _show_manage_records(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE, selected_date: date
    ) -> None:
        """List one user's selected-day entries or weigh-ins for safe selection."""
        language_code = self._language(update)
        flow_data = self._flow_data(context)
        record_type = flow_data.get(MANAGE_TYPE_KEY)
        period = ExportPeriod(selected_date, selected_date)
        records: list[Entry | WeighIn] = []
        if record_type == "entry":
            records.extend(
                await self._run_sync(
                    lambda: self.logbook.entries_in_period(self._user_id(update), period, self.config.timezone)
                )
            )
        else:
            records.extend(
                await self._run_sync(
                    lambda: self.logbook.weigh_ins_in_period(self._user_id(update), period, self.config.timezone)
                )
            )
        if not records:
            record_name = (
                t(language_code, "weigh_in_kind") if record_type == "weigh_in" else t(language_code, "meal_kind")
            )
            await self._message(update).reply_text(
                t(language_code, "manage_empty", record_type=record_name),
                reply_markup=choose_date_keyboard(language_code),
            )
            return
        flow_data[MANAGE_DATE_KEY] = selected_date
        flow_data[MANAGE_ALL_ITEMS_KEY] = [(record.id, self._record_select_label(record, update)) for record in records]
        flow_data[MANAGE_PAGE_KEY] = 0
        await self._show_manage_page(update, context, 0)

    async def _show_trash(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Purge expired data then list recoverable records with explicit types."""
        language_code = self._language(update)
        await self._run_sync(lambda: self.db.purge_deleted_before(self._now() - timedelta(days=30)))
        items = await self._run_sync(lambda: self.db.list_trash(self._user_id(update)))
        if not items:
            await self._message(update).reply_text(
                t(language_code, "trash_empty"), reply_markup=manage_keyboard(language_code)
            )
            return
        flow_data = self._flow_data(context)
        flow_data[MANAGE_ALL_ITEMS_KEY] = [
            (item.record_type, item.record_id, self._trash_select_label(item)) for item in items
        ]
        flow_data[MANAGE_PAGE_KEY] = 0
        await self._show_trash_page(update, context, 0)

    async def _show_manage_page(self, update: Update, context: ContextTypes.DEFAULT_TYPE, delta: int) -> None:
        """Render one eight-record page while retaining only current-page selectable ids."""
        flow_data = self._flow_data(context)
        all_items = flow_data.get(MANAGE_ALL_ITEMS_KEY)
        if not isinstance(all_items, list) or not all_items:
            await self._begin_manage(update, context)
            return
        current_page = flow_data.get(MANAGE_PAGE_KEY)
        page = max(0, min(int(current_page) + delta if isinstance(current_page, int) else 0, (len(all_items) - 1) // 8))
        page_items = all_items[page * 8 : (page + 1) * 8]
        if not all(isinstance(item, tuple) and len(item) == 2 for item in page_items):
            await self._begin_manage(update, context)
            return
        typed_items = cast(list[tuple[int, str]], page_items)
        flow_data[MANAGE_PAGE_KEY] = page
        flow_data[MANAGE_ITEMS_KEY] = [record_id for record_id, _ in typed_items]
        flow_data[FLOW_KEY] = Flow.MANAGE_LIST.value
        language_code = self._language(update)
        await self._message(update).reply_text(
            t(language_code, "manage_select"),
            reply_markup=record_list_keyboard(
                language_code,
                [label for _, label in typed_items],
                has_previous=page > 0,
                has_next=(page + 1) * 8 < len(all_items),
            ),
        )

    async def _show_trash_page(self, update: Update, context: ContextTypes.DEFAULT_TYPE, delta: int) -> None:
        """Render one eight-record Trash page while retaining typed current-page selections."""
        flow_data = self._flow_data(context)
        all_items = flow_data.get(MANAGE_ALL_ITEMS_KEY)
        if not isinstance(all_items, list) or not all_items:
            await self._begin_manage(update, context)
            return
        current_page = flow_data.get(MANAGE_PAGE_KEY)
        page = max(0, min(int(current_page) + delta if isinstance(current_page, int) else 0, (len(all_items) - 1) // 8))
        page_items = all_items[page * 8 : (page + 1) * 8]
        if not all(isinstance(item, tuple) and len(item) == 3 for item in page_items):
            await self._begin_manage(update, context)
            return
        typed_items = cast(list[tuple[str, int, str]], page_items)
        flow_data[MANAGE_PAGE_KEY] = page
        flow_data[MANAGE_ITEMS_KEY] = [(record_type, record_id) for record_type, record_id, _ in typed_items]
        flow_data[FLOW_KEY] = Flow.TRASH_LIST.value
        language_code = self._language(update)
        await self._message(update).reply_text(
            t(language_code, "trash_prompt"),
            reply_markup=record_list_keyboard(
                language_code,
                [label for _, _, label in typed_items],
                has_previous=page > 0,
                has_next=(page + 1) * 8 < len(all_items),
            ),
        )

    async def _request_delete(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE, record_type: str, record_id: int
    ) -> None:
        """Load a target before a destructive change and ask for confirmation."""
        language_code = self._language(update)
        flow_data = self._flow_data(context)
        flow_data[MANAGE_TYPE_KEY] = record_type
        flow_data[MANAGE_RECORD_ID_KEY] = record_id
        record = await self._current_record(update, flow_data)
        if record is None:
            await self._message(update).reply_text(t(language_code, "entry_not_found"))
            return
        flow_data[FLOW_KEY] = Flow.DELETE_CONFIRM.value
        await self._message(update).reply_text(
            t(language_code, "manage_delete_confirm", record=self._record_line(record, update)),
            reply_markup=confirm_delete_keyboard(language_code),
        )

    async def _confirm_delete(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Move the selected record to trash only after an explicit confirmation."""
        flow_data = self._flow_data(context)
        record_type = flow_data.get(MANAGE_TYPE_KEY)
        record_id = flow_data.get(MANAGE_RECORD_ID_KEY)
        language_code = self._language(update)
        if not isinstance(record_type, str) or not isinstance(record_id, int):
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        deleted = await self._run_sync(
            lambda: (
                self.db.delete_weigh_in(self._user_id(update), record_id, self._now())
                if record_type == "weigh_in"
                else self.logbook.delete_entry(self._user_id(update), record_id, self._now())
            )
        )
        if not deleted:
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        self._clear_flow(context)
        await self._message(update).reply_text(
            t(language_code, "deleted_to_trash"), reply_markup=main_keyboard(language_code)
        )

    async def _restore_selected_record(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Restore a selected trashed record, preserving the active-activity invariant."""
        flow_data = self._flow_data(context)
        record_type = flow_data.get(MANAGE_TYPE_KEY)
        record_id = flow_data.get(MANAGE_RECORD_ID_KEY)
        language_code = self._language(update)
        if not isinstance(record_type, str) or not isinstance(record_id, int):
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        record: Entry | WeighIn | None
        try:
            record = await self._run_sync(
                lambda: (
                    self.db.restore_weigh_in(self._user_id(update), record_id)
                    if record_type == "weigh_in"
                    else self.db.restore_entry(self._user_id(update), record_id)
                )
            )
        except ActiveActivityError as exc:
            await self._message(update).reply_text(t(language_code, "invalid_edit", reason=str(exc)))
            return
        if record is None:
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        self._clear_flow(context)
        markup = (
            active_keyboard(language_code, record.kind)
            if isinstance(record, Entry) and record.is_open
            else main_keyboard(language_code)
        )
        await self._message(update).reply_text(
            t(language_code, "restored", record=self._record_line(record, update)), reply_markup=markup
        )

    async def _save_management_edit(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE, text: str, semantic_button: str | None
    ) -> None:
        """Validate and persist one field-level correction without changing other fields."""
        flow_data = self._flow_data(context)
        record_type = flow_data.get(MANAGE_TYPE_KEY)
        record_id = flow_data.get(MANAGE_RECORD_ID_KEY)
        field = flow_data.get(MANAGE_EDIT_FIELD_KEY)
        language_code = self._language(update)
        if not isinstance(record_type, str) or not isinstance(record_id, int) or not isinstance(field, str):
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        record: Entry | WeighIn | None
        try:
            if record_type == "weigh_in":
                if field == "value":
                    record = await self._run_sync(
                        lambda: self.db.update_weigh_in(
                            self._user_id(update),
                            record_id,
                            weight_grams=parse_weight_grams(text, self._weight_unit(update)),
                        )
                    )
                else:
                    recorded_at = parse_local_datetime(text, self.config.timezone)
                    record = await self._run_sync(
                        lambda: self.db.update_weigh_in(self._user_id(update), record_id, recorded_at=recorded_at)
                    )
            else:
                fields: dict[str, EntryFieldValue]
                if field == "type":
                    kind_map = {
                        "meal_kind_button": "meal",
                        "training_kind_button": "training",
                        "sleep_kind_button": "sleep",
                    }
                    if semantic_button not in kind_map:
                        raise ValueError("Choose one of the entry types")
                    fields = {"kind": kind_map[semantic_button]}
                    if kind_map[semantic_button] == "meal":
                        fields["end_at"] = None
                elif field == "label":
                    fields = {"label": text}
                elif field == "details":
                    fields = {"text": text}
                elif field == "start":
                    fields = {"start_at": parse_local_datetime(text, self.config.timezone)}
                else:
                    fields = {
                        "end_at": None
                        if text.casefold() in {"open", "none", "-"}
                        else parse_local_datetime(text, self.config.timezone)
                    }
                record = await self._run_sync(lambda: self.db.update_entry(self._user_id(update), record_id, fields))
        except (ActiveActivityError, ValueError) as exc:
            await self._message(update).reply_text(t(language_code, "invalid_edit", reason=str(exc)))
            return
        if record is None:
            await self._message(update).reply_text(t(language_code, "record_unavailable"))
            return
        self._clear_flow(context)
        markup = (
            active_keyboard(language_code, record.kind)
            if isinstance(record, Entry) and record.is_open
            else main_keyboard(language_code)
        )
        await self._message(update).reply_text(
            t(language_code, "edit_saved", record=self._record_line(record, update)), reply_markup=markup
        )

    async def _current_record(self, update: Update, flow_data: dict[str, object]) -> Entry | WeighIn | None:
        """Reload a selected current record and re-check user ownership."""
        record_type = flow_data.get(MANAGE_TYPE_KEY)
        record_id = flow_data.get(MANAGE_RECORD_ID_KEY)
        if not isinstance(record_type, str) or not isinstance(record_id, int):
            return None
        if record_type == "weigh_in":
            return await self._run_sync(lambda: self.db.get_weigh_in(self._user_id(update), record_id))
        if record_type == "entry":
            return await self._run_sync(lambda: self.db.get_entry(self._user_id(update), record_id))
        return None

    def _record_line(self, record: Entry | WeighIn, update: Update) -> str:
        """Render either editable record type with the saved unit and locale."""
        if isinstance(record, WeighIn):
            return weigh_in_line(record, self.config.timezone, self._language(update), self._weight_unit(update))
        return entry_line(record, self.config.timezone, self._language(update))

    def _record_select_label(self, record: Entry | WeighIn, update: Update) -> str:
        """Build a short dynamic record button that carries a stable database id."""
        if isinstance(record, WeighIn):
            return f"#{record.id} · ⚖️ {format_weight(record.weight_grams, self._weight_unit(update))}"
        return f"#{record.id} · {record.label}"

    @staticmethod
    def _trash_select_label(item: TrashItem) -> str:
        """Build a type-prefixed recoverable-record selector."""
        prefix = "W" if item.record_type == "weigh_in" else "E"
        return f"{prefix}#{item.record_id} · {item.label}"

    @staticmethod
    def _parse_manage_date(text: str) -> date | None:
        """Accept only the documented ISO calendar-day format."""
        try:
            return date.fromisoformat(text.strip())
        except ValueError:
            return None

    @staticmethod
    def _selected_record_id(text: str, flow_data: dict[str, object]) -> int | None:
        """Resolve a dynamic current-record button while rejecting stale ids."""
        if not text.startswith("#"):
            return None
        raw_id = text[1:].split("·", 1)[0].strip()
        if not raw_id.isdigit():
            return None
        record_id = int(raw_id)
        candidates = flow_data.get(MANAGE_ITEMS_KEY)
        return record_id if isinstance(candidates, list) and record_id in candidates else None

    @staticmethod
    def _selected_trash_record(text: str, flow_data: dict[str, object]) -> tuple[str, int] | None:
        """Resolve a type-prefixed dynamic trash button while rejecting stale ids."""
        if len(text) < 3 or text[0] not in {"E", "W"} or text[1] != "#":
            return None
        raw_id = text[2:].split("·", 1)[0].strip()
        if not raw_id.isdigit():
            return None
        candidate = ("weigh_in" if text[0] == "W" else "entry", int(raw_id))
        candidates = flow_data.get(MANAGE_ITEMS_KEY)
        return candidate if isinstance(candidates, list) and candidate in candidates else None

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
        """Fetch and render today's entries and body-weight readings."""
        language_code = self._language(update)
        period = ExportPeriod(self._now().date(), self._now().date())
        data = await self._run_sync(
            lambda: self.logbook.report_data_in_period(self._user_id(update), period, self.config.timezone)
        )
        if not data.entries and not data.weigh_ins:
            await self._message(update).reply_text(t(language_code, "today_empty"))
            return
        lines: list[str] = []
        if data.entries:
            lines.append(entries_block(data.entries, self.config.timezone, language_code))
        lines.extend(
            weigh_in_line(weigh_in, self.config.timezone, language_code, self._weight_unit(update))
            for weigh_in in data.weigh_ins
        )
        await self._message(update).reply_text("\n\n".join(lines))

    async def _send_last(self, update: Update) -> None:
        """Fetch and render the authorized user's latest entry in their language."""
        language_code = self._language(update)
        entry = await self._run_sync(lambda: self.logbook.latest_entry(self._user_id(update)))
        if entry is None:
            await self._message(update).reply_text(t(language_code, "last_none"))
            return
        await self._message(update).reply_text(entry_line(entry, self.config.timezone, language_code))

    async def _send_all_export(self, update: Update, export_format: str, report_locale: str) -> None:
        """Export every saved entry and weigh-in in the narrowest containing period."""
        export_data = await self._run_sync(
            lambda: self.logbook.all_data_period(self._user_id(update), self.config.timezone)
        )
        if export_data is None:
            await self._message(update).reply_text(
                t(self._language(update), "export_empty"), reply_markup=main_keyboard(self._language(update))
            )
            return
        period, data = export_data
        await self._upload_export(update, data.entries, data.weigh_ins, period, export_format, report_locale)

    async def _send_export(self, update: Update, action: ParsedAction, report_locale: str | None = None) -> None:
        """Build and upload a requested XLSX or PDF export without writing temporary files."""
        language_code = self._language(update)
        if action.start_date is None or action.end_date is None:
            await self._message(update).reply_text(t(language_code, "export_prompt"))
            return
        if action.end_date < action.start_date:
            await self._message(update).reply_text(t(language_code, "date_order"))
            return
        period = ExportPeriod(action.start_date, action.end_date)
        data = await self._run_sync(
            lambda: self.logbook.report_data_in_period(self._user_id(update), period, self.config.timezone)
        )
        if not data.entries and not data.weigh_ins:
            await self._message(update).reply_text(
                t(language_code, "export_empty"), reply_markup=main_keyboard(language_code)
            )
            return
        await self._upload_export(
            update, data.entries, data.weigh_ins, period, action.export_format, report_locale or language_code
        )

    async def _upload_export(
        self,
        update: Update,
        entries: list[Entry],
        weigh_ins: list[WeighIn],
        period: ExportPeriod,
        requested_format: str | None,
        report_locale: str,
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
                export_pdf(
                    entries,
                    period.start_date,
                    period.end_date,
                    self.config.timezone,
                    weigh_ins=weigh_ins,
                    locale=report_locale,
                    weight_unit=self._weight_unit(update),
                )
                if export_format == "pdf"
                else export_xlsx(
                    entries,
                    period.start_date,
                    period.end_date,
                    self.config.timezone,
                    weigh_ins=weigh_ins,
                    locale=report_locale,
                    weight_unit=self._weight_unit(update),
                )
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
            if user.id not in self._profiles:
                settings = await self._run_sync(
                    lambda: self.logbook.get_or_create_settings(user.id, lang_from_code(user.language_code))
                )
                self._profiles[user.id] = settings
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
        flow_data.pop(EXPORT_LOCALE_KEY, None)
        flow_data.pop(EXPORT_START_KEY, None)
        flow_data.pop(EXPORT_END_KEY, None)
        flow_data.pop(MANAGE_TYPE_KEY, None)
        flow_data.pop(MANAGE_DATE_KEY, None)
        flow_data.pop(MANAGE_RECORD_ID_KEY, None)
        flow_data.pop(MANAGE_EDIT_FIELD_KEY, None)
        flow_data.pop(MANAGE_ITEMS_KEY, None)
        flow_data.pop(MANAGE_ALL_ITEMS_KEY, None)
        flow_data.pop(MANAGE_PAGE_KEY, None)

    def _export_format(self, context: ContextTypes.DEFAULT_TYPE) -> str:
        """Return a valid selected format, falling back safely to XLSX."""
        return "pdf" if self._flow_data(context).get(EXPORT_FORMAT_KEY) == "pdf" else "xlsx"

    def _export_locale(self, context: ContextTypes.DEFAULT_TYPE) -> str:
        """Return the explicitly selected report locale, defaulting safely to English."""
        value = self._flow_data(context).get(EXPORT_LOCALE_KEY)
        return value if value in {"en", "it"} else "en"

    def _language(self, update: Update) -> str:
        """Return the saved locale, falling back only before first profile initialization."""
        user = update.effective_user
        if user is not None and user.id in self._profiles:
            return self._profiles[user.id].locale
        return lang_from_code(user.language_code if user is not None else None)

    def _weight_unit(self, update: Update) -> str:
        """Return the saved display unit, defaulting safely to metric kilograms."""
        user = update.effective_user
        return self._profiles[user.id].weight_unit if user is not None and user.id in self._profiles else "kg"

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
