"""Localized Telegram reply-keyboard construction."""

from __future__ import annotations

from telegram import KeyboardButton, ReplyKeyboardMarkup

from dailylogbot.i18n import button


def main_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    """Build the default keyboard for idle users."""
    rows = [
        [_btn(language_code, "meal"), _btn(language_code, "training"), _btn(language_code, "sleep")],
        [_btn(language_code, "today"), _btn(language_code, "last"), _btn(language_code, "export")],
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


def _btn(language_code: str | None, key: str) -> KeyboardButton:
    """Build one localized keyboard button."""
    return KeyboardButton(button(language_code, key))
