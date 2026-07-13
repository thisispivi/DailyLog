"""Localized Telegram reply-keyboard construction."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from telegram import KeyboardButton, ReplyKeyboardMarkup

from dailylogbot.i18n import button


def main_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build the default keyboard for idle users."""
    rows = [
        [_btn(language_code, "meal"), _btn(language_code, "training"), _btn(language_code, "sleep")],
        [_btn(language_code, "weigh_in"), _btn(language_code, "today"), _btn(language_code, "last")],
        [_btn(language_code, "manage"), _btn(language_code, "export"), _btn(language_code, "settings")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def cancel_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build a keyboard for cancellable multi-step flows."""
    return ReplyKeyboardMarkup([[_btn(language_code, "cancel")]], resize_keyboard=True, is_persistent=True)


def active_keyboard(language_code: str | None, kind: str) -> ReplyKeyboardMarkup:
    """Build a restricted keyboard for an open activity."""
    end_key = "end_sleep" if kind == "sleep" else "end_training"
    rows = [[_btn(language_code, end_key)], [_btn(language_code, "cancel")]]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def meal_type_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build the meal type selection keyboard."""
    rows = [
        [_btn(language_code, "breakfast"), _btn(language_code, "snack_1")],
        [_btn(language_code, "lunch"), _btn(language_code, "snack_2")],
        [_btn(language_code, "dinner"), _btn(language_code, "cancel")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def training_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build the training activity suggestion keyboard."""
    rows = [
        [_btn(language_code, "walk"), _btn(language_code, "run"), _btn(language_code, "gym")],
        [_btn(language_code, "tennis"), _btn(language_code, "table_tennis")],
        [_btn(language_code, "cancel")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def export_format_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build the export format selection keyboard."""
    rows = [[_btn(language_code, "xlsx"), _btn(language_code, "pdf")], [_btn(language_code, "cancel")]]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def export_range_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build the export range selection keyboard."""
    rows = [[_btn(language_code, "all"), _btn(language_code, "range")], [_btn(language_code, "cancel")]]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def settings_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build settings choices."""
    rows = [
        [_btn(language_code, "english"), _btn(language_code, "italian")],
        [_btn(language_code, "export_english"), _btn(language_code, "export_italian")],
        [_btn(language_code, "kg"), _btn(language_code, "lb")],
        [_btn(language_code, "cancel")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def manage_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build top-level record-management choices."""
    rows = [
        [_btn(language_code, "entries"), _btn(language_code, "weigh_ins")],
        [_btn(language_code, "trash")],
        [_btn(language_code, "cancel")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def choose_date_keyboard(
    language_code: str | None, recent_dates: Sequence[date] = (), *, today: date | None = None
) -> ReplyKeyboardMarkup:
    """Offer Today and recent record dates while allowing typed ISO dates."""
    date_buttons = [_btn(language_code, "today")]
    date_buttons.extend(KeyboardButton(value.isoformat()) for value in recent_dates if today is None or value != today)
    rows = [date_buttons[index : index + 3] for index in range(0, len(date_buttons), 3)]
    rows.append([_btn(language_code, "cancel")])
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def record_action_keyboard(language_code: str | None, *, deleted: bool = False) -> ReplyKeyboardMarkup:
    """Build actions for a selected current or trashed record."""
    action = "restore" if deleted else "edit"
    rows = [
        [_btn(language_code, action)],
        [_btn(language_code, "delete")],
        [_btn(language_code, "back"), _btn(language_code, "cancel")],
    ]
    if deleted:
        rows = [[_btn(language_code, "restore")], [_btn(language_code, "back"), _btn(language_code, "cancel")]]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def edit_fields_keyboard(
    language_code: str | None, record_type: str, entry_kind: str | None = None
) -> ReplyKeyboardMarkup:
    """Build field-level edit choices for an entry or weigh-in."""
    if record_type == "weigh_in":
        rows = [[_btn(language_code, "value"), _btn(language_code, "recorded_at")]]
    else:
        rows = [
            [_btn(language_code, "type"), _btn(language_code, "label")],
            [_btn(language_code, "details")],
            [_btn(language_code, "date"), _btn(language_code, "start")],
        ]
        if entry_kind in {"training", "sleep"}:
            rows[-1].append(_btn(language_code, "end"))
    rows.append([_btn(language_code, "back"), _btn(language_code, "cancel")])
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def entry_kind_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build selectable persisted entry kinds."""
    rows = [
        [_btn(language_code, "meal_kind_button"), _btn(language_code, "training_kind_button")],
        [_btn(language_code, "sleep_kind_button")],
        [_btn(language_code, "back"), _btn(language_code, "cancel")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def confirm_delete_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build a destructive-action confirmation keyboard."""
    return ReplyKeyboardMarkup(
        [[_btn(language_code, "confirm_delete")], [_btn(language_code, "back"), _btn(language_code, "cancel")]],
        resize_keyboard=True,
        is_persistent=True,
    )


def record_list_keyboard(
    language_code: str | None, labels: Sequence[str], *, has_previous: bool = False, has_next: bool = False
) -> ReplyKeyboardMarkup:
    """Build a compact dynamic record-selection keyboard."""
    rows = [[KeyboardButton(label)] for label in labels]
    navigation: list[KeyboardButton] = []
    if has_previous:
        navigation.append(KeyboardButton("◀"))
    if has_next:
        navigation.append(KeyboardButton("▶"))
    if navigation:
        rows.append(navigation)
    rows.append([_btn(language_code, "back"), _btn(language_code, "cancel")])
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def _btn(language_code: str | None, key: str) -> KeyboardButton:
    """Build one localized keyboard button."""
    return KeyboardButton(button(language_code, key))
