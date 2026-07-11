from __future__ import annotations

import json
from functools import cache
from importlib.resources import files
from typing import Final


SUPPORTED_LANGUAGES: Final = frozenset({"en", "it"})
_REQUIRED_SECTIONS: Final = frozenset({"buttons", "button_aliases", "messages", "meal_types", "activity_labels"})


class TranslationCatalogError(RuntimeError):
    """Raised when a bundled translation catalog is missing or structurally invalid."""


def lang_from_code(language_code: str | None) -> str:
    """Return the supported language associated with Telegram's language code."""
    return "it" if language_code and language_code.lower().startswith("it") else "en"


def button(language_code: str | None, key: str) -> str:
    """Return a localized, emoji-enhanced keyboard button label."""
    return _value(language_code, "buttons", key)


def button_key(language_code: str | None, value: str) -> str | None:
    """Resolve a localized button label or legacy text alias to its semantic key."""
    language = lang_from_code(language_code)
    normalized = _normalize(value)
    for key, label in _section(language, "buttons").items():
        if _normalize(label) == normalized:
            return key
    return _section(language, "button_aliases").get(normalized)


def meal_type_labels(language_code: str | None) -> dict[str, str]:
    """Return canonical meal types mapped to their localized button labels."""
    language = lang_from_code(language_code)
    return {
        canonical: _value(language, "buttons", button_key)
        for canonical, button_key in _section(language, "meal_types").items()
    }


def meal_type_from_label(language_code: str | None, value: str) -> str | None:
    """Return a canonical meal type from a localized or canonical label."""
    normalized = _normalize(value)
    for canonical, localized in meal_type_labels(language_code).items():
        if normalized in {_normalize(canonical), _normalize(localized)}:
            return canonical
    return None


def meal_type_button_key(language_code: str | None, meal_type: str) -> str:
    """Return the button key associated with one canonical persisted meal type."""
    language = lang_from_code(language_code)
    return _value(language, "meal_types", meal_type)


def activity_label(language_code: str | None, key: str) -> str:
    """Return the canonical persisted label for a localized activity suggestion."""
    return _value(language_code, "activity_labels", key)


def is_activity_suggestion(language_code: str | None, key: str | None) -> bool:
    """Return whether a semantic button key is a configured training suggestion."""
    return key is not None and key in _section(lang_from_code(language_code), "activity_labels")


def kind_name(language_code: str | None, kind: str) -> str:
    """Return a short localized name for a persisted entry kind."""
    return t(language_code, f"{kind}_kind")


def t(language_code: str | None, key: str, **kwargs: object) -> str:
    """Return a localized message with the supplied named values interpolated."""
    return _value(language_code, "messages", key).format(**kwargs)


@cache
def _catalog(language: str) -> dict[str, dict[str, str]]:
    """Load and validate one bundled JSON translation catalog exactly once."""
    if language not in SUPPORTED_LANGUAGES:
        raise TranslationCatalogError(f"Unsupported translation catalog: {language}")
    try:
        raw_catalog = json.loads(files("dailylogbot").joinpath("locales", f"{language}.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise TranslationCatalogError(f"Unable to load the {language} translation catalog.") from exc
    if not isinstance(raw_catalog, dict) or set(raw_catalog) != _REQUIRED_SECTIONS:
        raise TranslationCatalogError(f"The {language} translation catalog has invalid sections.")
    catalog: dict[str, dict[str, str]] = {}
    for section_name in _REQUIRED_SECTIONS:
        section = raw_catalog[section_name]
        if not isinstance(section, dict) or not section or not all(
            isinstance(key, str) and isinstance(value, str) and key and value for key, value in section.items()
        ):
            raise TranslationCatalogError(f"The {language} translation catalog has an invalid {section_name} section.")
        catalog[section_name] = section
    return catalog


def _section(language: str, section: str) -> dict[str, str]:
    """Return one validated catalog section for an already-supported language."""
    return _catalog(language)[section]


def _value(language_code: str | None, section: str, key: str) -> str:
    """Return one required translation value with an explicit catalog failure on gaps."""
    language = lang_from_code(language_code)
    try:
        return _section(language, section)[key]
    except KeyError as exc:
        raise TranslationCatalogError(f"Missing {section}.{key} in the {language} translation catalog.") from exc


def _normalize(value: str) -> str:
    """Normalize user text for reliable case-insensitive keyboard matching."""
    return " ".join(value.strip().split()).casefold()
