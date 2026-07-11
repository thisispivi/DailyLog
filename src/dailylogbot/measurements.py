"""Metric-normalized body-weight conversion and presentation helpers."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from dailylogbot.db import VALID_WEIGHT_UNITS

_GRAMS_PER_KG = Decimal("1000")
_KG_PER_LB = Decimal("0.45359237")


def parse_weight_grams(raw: str, unit: str) -> int:
    """Parse a localized decimal body-weight value into canonical grams."""
    if unit not in VALID_WEIGHT_UNITS:
        raise ValueError("Unsupported weight unit")
    normalized = raw.strip().replace(",", ".")
    if not normalized or normalized.count(".") > 1 or any(character not in "0123456789." for character in normalized):
        raise ValueError("Enter a positive number, for example 72.4")
    try:
        value = Decimal(normalized)
    except InvalidOperation as error:
        raise ValueError("Enter a positive number, for example 72.4") from error
    if value <= 0:
        raise ValueError("Weight must be greater than zero")
    kilograms = value if unit == "kg" else value * _KG_PER_LB
    grams = int((kilograms * _GRAMS_PER_KG).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if not 0 < grams <= 1_000_000:
        raise ValueError("Weight must be at most 1000 kg")
    return grams


def format_weight(weight_grams: int, unit: str) -> str:
    """Render canonical metric grams in the selected user-facing unit."""
    if unit not in VALID_WEIGHT_UNITS:
        raise ValueError("Unsupported weight unit")
    value = Decimal(weight_grams) / _GRAMS_PER_KG
    if unit == "lb":
        value = value / _KG_PER_LB
    rendered = f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):f}".rstrip("0").rstrip(".")
    return f"{rendered} {unit}"
