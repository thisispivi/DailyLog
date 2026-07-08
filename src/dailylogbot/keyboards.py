from __future__ import annotations

from telegram import KeyboardButton, ReplyKeyboardMarkup


def main_keyboard(language_code: str | None) -> ReplyKeyboardMarkup:
    if language_code and language_code.lower().startswith("it"):
        rows = [
            [KeyboardButton("Aggiungi pasto"), KeyboardButton("Inizia sport"), KeyboardButton("Fine sport")],
            [KeyboardButton("Inizia sonno"), KeyboardButton("Fine sonno")],
            [KeyboardButton("Oggi"), KeyboardButton("Ultimo")],
            [KeyboardButton("XLSX"), KeyboardButton("PDF")],
        ]
    else:
        rows = [
            [KeyboardButton("Add meal"), KeyboardButton("Start training"), KeyboardButton("End training")],
            [KeyboardButton("Start sleep"), KeyboardButton("End sleep")],
            [KeyboardButton("Today"), KeyboardButton("Last")],
            [KeyboardButton("XLSX"), KeyboardButton("PDF")],
        ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)
