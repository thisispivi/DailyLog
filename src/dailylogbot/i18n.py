from __future__ import annotations


def lang_from_code(language_code: str | None) -> str:
    if language_code and language_code.lower().startswith("it"):
        return "it"
    return "en"


MESSAGES = {
    "en": {
        "unauthorized": "This bot is private.",
        "start": "DailyLogBot is ready. Use the buttons or write short logs like: breakfast eggs 150g, tennis, stop, sleep, wake.",
        "help": (
            "Fast examples:\n"
            "breakfast eggs 150g bread 80g\n"
            "lunch pasta 120g chicken 200g\n"
            "tennis\n"
            "stop\n"
            "sleep\n"
            "wake\n"
            "/export pdf\n"
            "/export 2026-07-01 2026-07-31 xlsx\n"
            "/edit 12 label=Lunch text=pasta 120g chicken 200g"
        ),
        "meal_prompt": "Write the meal in one line, for example: lunch pasta 120g chicken 200g",
        "training_prompt": "Write the activity name to start it now, for example: tennis",
        "export_prompt": "Tap XLSX/PDF for this month, or use: /export 2026-07-01 2026-07-31 xlsx",
        "last_none": "No entries yet.",
        "deleted_last": "Deleted last entry.",
        "nothing_to_delete": "Nothing to delete.",
        "unknown": "I did not understand. Use a button or /help.",
    },
    "it": {
        "unauthorized": "Questo bot e privato.",
        "start": "DailyLogBot e pronto. Usa i pulsanti o scrivi log brevi: colazione uova 150g, tennis, fine, dormo, sveglia.",
        "help": (
            "Esempi rapidi:\n"
            "colazione uova 150g pane 80g\n"
            "pranzo pasta 120g pollo 200g\n"
            "tennis\n"
            "fine\n"
            "dormo\n"
            "sveglia\n"
            "/export pdf\n"
            "/export 2026-07-01 2026-07-31 xlsx\n"
            "/edit 12 label=Pranzo text=pasta 120g pollo 200g"
        ),
        "meal_prompt": "Scrivi il pasto in una riga, per esempio: pranzo pasta 120g pollo 200g",
        "training_prompt": "Scrivi il nome dell'attivita per iniziare ora, per esempio: tennis",
        "export_prompt": "Tocca XLSX/PDF per questo mese, oppure usa: /export 2026-07-01 2026-07-31 xlsx",
        "last_none": "Nessuna voce salvata.",
        "deleted_last": "Ultima voce eliminata.",
        "nothing_to_delete": "Niente da eliminare.",
        "unknown": "Non ho capito. Usa un pulsante o /help.",
    },
}


def t(language_code: str | None, key: str) -> str:
    lang = lang_from_code(language_code)
    return MESSAGES[lang][key]
