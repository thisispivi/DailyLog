from __future__ import annotations


def lang_from_code(language_code: str | None) -> str:
    """Return the supported language associated with Telegram's language code."""
    return "it" if language_code and language_code.lower().startswith("it") else "en"


BUTTONS = {
    "en": {
        "meal": "🍽 Add meal",
        "training": "🏃 Start training",
        "sleep": "😴 Start sleep",
        "today": "📅 Today",
        "last": "🕘 Last",
        "export": "📤 Export",
        "cancel": "✖ Cancel",
        "end_training": "⏹ End training",
        "end_sleep": "⏹ End sleep",
        "xlsx": "📊 XLSX",
        "pdf": "📄 PDF",
        "all": "🗂 All data",
        "range": "📆 Date range",
        "breakfast": "🍳 Breakfast",
        "snack_1": "🍎 Snack 1",
        "lunch": "🥗 Lunch",
        "snack_2": "🍌 Snack 2",
        "dinner": "🍽 Dinner",
        "walk": "🚶 Walk",
        "run": "🏃 Run",
        "gym": "🏋️ Gym",
        "tennis": "🎾 Tennis",
        "table_tennis": "🏓 Table tennis",
    },
    "it": {
        "meal": "🍽 Aggiungi pasto",
        "training": "🏃 Inizia allenamento",
        "sleep": "😴 Inizia sonno",
        "today": "📅 Oggi",
        "last": "🕘 Ultimo",
        "export": "📤 Esporta",
        "cancel": "✖ Annulla",
        "end_training": "⏹ Termina allenamento",
        "end_sleep": "⏹ Termina sonno",
        "xlsx": "📊 XLSX",
        "pdf": "📄 PDF",
        "all": "🗂 Tutti i dati",
        "range": "📆 Intervallo date",
        "breakfast": "🍳 Colazione",
        "snack_1": "🍎 Spuntino 1",
        "lunch": "🥗 Pranzo",
        "snack_2": "🍌 Spuntino 2",
        "dinner": "🍽 Cena",
        "walk": "🚶 Camminata",
        "run": "🏃 Corsa",
        "gym": "🏋️ Palestra",
        "tennis": "🎾 Tennis",
        "table_tennis": "🏓 Ping pong",
    },
}


BUTTON_ALIASES = {
    "en": {
        "add meal": "meal",
        "start training": "training",
        "start sleep": "sleep",
        "today": "today",
        "last": "last",
        "export": "export",
        "cancel": "cancel",
        "end training": "end_training",
        "end sleep": "end_sleep",
        "xlsx": "xlsx",
        "pdf": "pdf",
        "all": "all",
        "date range": "range",
    },
    "it": {
        "aggiungi pasto": "meal",
        "inizia sport": "training",
        "inizia allenamento": "training",
        "inizia sonno": "sleep",
        "oggi": "today",
        "ultimo": "last",
        "esporta": "export",
        "annulla": "cancel",
        "fine sport": "end_training",
        "termina allenamento": "end_training",
        "fine sonno": "end_sleep",
        "termina sonno": "end_sleep",
        "tutto": "all",
        "intervallo date": "range",
    },
}


MESSAGES = {
    "en": {
        "unauthorized": "🔒 This bot is private.",
        "start": (
            "👋 DailyLog is ready in English.\n\n"
            "Use the buttons for a guided flow:\n"
            "🍽 Meal → type → details\n"
            "🏃 Training → activity → end\n"
            "😴 Sleep → end\n"
            "📤 Export → format → all data or dates\n\n"
            "You can write /help whenever you are not tracking an activity."
        ),
        "help": (
            "How to log your day:\n\n"
            "🍽 Add meal → choose the meal type → write food and quantities.\n"
            "🏃 Start training → choose a suggestion or send any activity name → end it when finished.\n"
            "😴 Start sleep → end it after waking up.\n"
            "📤 Export → choose XLSX or PDF → choose all data or a date range.\n\n"
            "At any selection step, use ✖ Cancel or /cancel. While a training or sleep session is open, only end or cancel it first.\n\n"
            "Quick text entries also work: lunch pasta 120g chicken 200g, tennis 18:00-19:30, sleep 23:30-07:10."
        ),
        "meal_type_prompt": "🍽 Step 1 of 2: choose the meal type.",
        "meal_text_prompt": "🍽 Step 2 of 2: write what you ate for {meal_type}.\nExample: pasta 120g chicken 200g",
        "meal_invalid": "Choose one of the meal types below, or cancel the flow.",
        "training_prompt": "🏃 Step 1 of 1: what activity are you starting? Choose one or write your own.",
        "activity_invalid": "Write an activity name (up to 120 characters), or cancel the flow.",
        "sleep_started": "😴 Sleep started:\n{entry}",
        "export_format_prompt": "📤 Step 1 of 3: choose the export format.",
        "export_range_prompt": "📤 Step 2 of 3: export all saved data or a date range?",
        "export_dates_prompt": "📤 Step 3 of 3: send dates as 2026-07-01 2026-07-31",
        "export_range_invalid": "Choose all data or date range below, or cancel the flow.",
        "export_empty": "📭 There are no entries to export for that period.",
        "export_prompt": "Use 📤 Export, then choose format and dates.",
        "last_none": "📭 No entries yet.",
        "today_empty": "📭 Nothing logged today yet.",
        "deleted_last": "🗑 Last entry deleted.",
        "nothing_to_delete": "📭 Nothing to delete.",
        "unknown": "I did not understand that. Use a button or /help.",
        "cancelled": "✖ Cancelled.",
        "activity_cancelled": "✖ Open {kind} cancelled and removed.",
        "no_flow": "There is nothing to cancel.",
        "saved": "✅ Saved:\n{entry}",
        "started": "▶️ Started:\n{entry}",
        "ended": "⏹ Ended:\n{entry}",
        "already_open": "⚠️ An activity is already open:\n{entry}\n\nEnd or cancel it before using another command.",
        "open_only": "⚠️ An activity is open. End or cancel it before using another command.",
        "no_open": "📭 No open {kind} entry.",
        "invalid_dates": "Use dates like: 2026-07-01 2026-07-31",
        "date_order": "The end date must not be before the start date.",
        "exporting": "📤 Preparing your {format} export…",
        "delete_usage": "Use: /delete 12",
        "deleted": "🗑 Deleted.",
        "entry_not_found": "📭 Entry not found.",
        "edit_usage": "Use: /edit 12 label=Lunch text=pasta 120g start=2026-07-08 12:30",
        "edit_last_usage": "Use: /edit_last text=pasta 120g or label=Lunch",
        "edit_empty": "No editable fields found. Use label=, text=, start=, end=, kind=.",
        "updated": "✅ Updated:\n{entry}",
        "invalid_entry": "⚠️ That entry could not be saved: {reason}",
        "language": "English",
        "meal_kind": "meal",
        "training_kind": "training",
        "sleep_kind": "sleep",
    },
    "it": {
        "unauthorized": "🔒 Questo bot è privato.",
        "start": (
            "👋 DailyLog è pronto in italiano.\n\n"
            "Usa i pulsanti per un flusso guidato:\n"
            "🍽 Pasto → tipo → dettagli\n"
            "🏃 Allenamento → attività → termina\n"
            "😴 Sonno → termina\n"
            "📤 Esporta → formato → tutti i dati o date\n\n"
            "Puoi scrivere /help quando non stai registrando un'attività."
        ),
        "help": (
            "Come registrare la giornata:\n\n"
            "🍽 Aggiungi pasto → scegli il tipo → scrivi cibo e quantità.\n"
            "🏃 Inizia allenamento → scegli un suggerimento o invia un'attività → termina quando hai finito.\n"
            "😴 Inizia sonno → termina al risveglio.\n"
            "📤 Esporta → scegli XLSX o PDF → tutti i dati o un intervallo.\n\n"
            "In ogni scelta usa ✖ Annulla o /cancel. Con allenamento o sonno aperto, prima devi terminarlo o annullarlo.\n\n"
            "Funzionano anche voci veloci: pranzo pasta 120g pollo 200g, tennis 18:00-19:30, sonno 23:30-07:10."
        ),
        "meal_type_prompt": "🍽 Passo 1 di 2: scegli il tipo di pasto.",
        "meal_text_prompt": "🍽 Passo 2 di 2: scrivi cosa hai mangiato per {meal_type}.\nEsempio: pasta 120g pollo 200g",
        "meal_invalid": "Scegli uno dei tipi di pasto qui sotto, oppure annulla il flusso.",
        "training_prompt": "🏃 Passo 1 di 1: quale attività inizi? Scegli o scrivi la tua.",
        "activity_invalid": "Scrivi il nome di un'attività (massimo 120 caratteri), oppure annulla il flusso.",
        "sleep_started": "😴 Sonno iniziato:\n{entry}",
        "export_format_prompt": "📤 Passo 1 di 3: scegli il formato di esportazione.",
        "export_range_prompt": "📤 Passo 2 di 3: esportare tutti i dati o un intervallo date?",
        "export_dates_prompt": "📤 Passo 3 di 3: invia le date così: 2026-07-01 2026-07-31",
        "export_range_invalid": "Scegli tutti i dati o intervallo date qui sotto, oppure annulla il flusso.",
        "export_empty": "📭 Non ci sono voci da esportare per questo periodo.",
        "export_prompt": "Usa 📤 Esporta, poi scegli formato e date.",
        "last_none": "📭 Nessuna voce salvata.",
        "today_empty": "📭 Oggi non hai ancora registrato nulla.",
        "deleted_last": "🗑 Ultima voce eliminata.",
        "nothing_to_delete": "📭 Niente da eliminare.",
        "unknown": "Non ho capito. Usa un pulsante o /help.",
        "cancelled": "✖ Annullato.",
        "activity_cancelled": "✖ {kind} aperto annullato e rimosso.",
        "no_flow": "Non c'è nulla da annullare.",
        "saved": "✅ Salvato:\n{entry}",
        "started": "▶️ Iniziato:\n{entry}",
        "ended": "⏹ Terminato:\n{entry}",
        "already_open": "⚠️ C'è già un'attività aperta:\n{entry}\n\nTermina o annullala prima di usare altri comandi.",
        "open_only": "⚠️ C'è un'attività aperta. Terminala o annullala prima di usare altri comandi.",
        "no_open": "📭 Nessuna voce {kind} aperta.",
        "invalid_dates": "Usa date così: 2026-07-01 2026-07-31",
        "date_order": "La data finale non può essere prima di quella iniziale.",
        "exporting": "📤 Preparo l'esportazione {format}…",
        "delete_usage": "Usa: /delete 12",
        "deleted": "🗑 Eliminato.",
        "entry_not_found": "📭 Voce non trovata.",
        "edit_usage": "Usa: /edit 12 label=Pranzo text=pasta 120g start=2026-07-08 12:30",
        "edit_last_usage": "Usa: /edit_last text=pasta 120g o label=Pranzo",
        "edit_empty": "Nessun campo modificabile trovato. Usa label=, text=, start=, end=, kind=.",
        "updated": "✅ Aggiornato:\n{entry}",
        "invalid_entry": "⚠️ Impossibile salvare questa voce: {reason}",
        "language": "Italiano",
        "meal_kind": "pasto",
        "training_kind": "allenamento",
        "sleep_kind": "sonno",
    },
}


def button(language_code: str | None, key: str) -> str:
    """Return a localized, emoji-enhanced keyboard button label."""
    return BUTTONS[lang_from_code(language_code)][key]


def button_key(language_code: str | None, value: str) -> str | None:
    """Resolve a localized button label or a legacy plain-text alias to its key."""
    language = lang_from_code(language_code)
    normalized = _normalize(value)
    for key, label in BUTTONS[language].items():
        if _normalize(label) == normalized:
            return key
    return BUTTON_ALIASES[language].get(normalized)


def meal_type_labels(language_code: str | None) -> dict[str, str]:
    """Return canonical meal labels mapped to their localized button labels."""
    return {
        "Breakfast": button(language_code, "breakfast"),
        "Snack 1": button(language_code, "snack_1"),
        "Lunch": button(language_code, "lunch"),
        "Snack 2": button(language_code, "snack_2"),
        "Dinner": button(language_code, "dinner"),
    }


def meal_type_from_label(language_code: str | None, value: str) -> str | None:
    """Return a canonical meal type from a localized or canonical label."""
    normalized = _normalize(value)
    for canonical, localized in meal_type_labels(language_code).items():
        if normalized in {_normalize(canonical), _normalize(localized)}:
            return canonical
    return None


def kind_name(language_code: str | None, kind: str) -> str:
    """Return a short localized name for a persisted entry kind."""
    return t(language_code, f"{kind}_kind")


def t(language_code: str | None, key: str, **kwargs: object) -> str:
    """Return a localized message, interpolating only supplied named values."""
    return MESSAGES[lang_from_code(language_code)][key].format(**kwargs)


def _normalize(value: str) -> str:
    """Normalize user text for reliable case-insensitive keyboard matching."""
    return " ".join(value.strip().split()).casefold()
