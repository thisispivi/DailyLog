from dailylogbot.i18n import activity_label, button, button_key, meal_type_button_key, meal_type_from_label, t


def test_json_catalogs_localize_buttons_messages_and_canonical_values() -> None:
    """Load both bundled JSON catalogs through the public localization boundary."""
    assert button("it-IT", "meal") == "🍽 Aggiungi pasto"
    assert button_key("it", "✖ Annulla") == "cancel"
    assert meal_type_from_label("it", "🥗 Pranzo") == "Lunch"
    assert meal_type_button_key("en", "Lunch") == "lunch"
    assert activity_label("it", "walk") == "Walk"
    assert t("fr", "language") == "English"
