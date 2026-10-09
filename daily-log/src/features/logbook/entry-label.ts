import { translate } from "@/core/i18n/translate";
import type { Entry, Locale } from "@/features/logbook/domain";

// Meal types and sleep are stored with the English labels the Telegram bot used,
// so existing data keeps working. They are translated only when displayed.
export const mealLabelKeys = {
    Breakfast: "entry.breakfast",
    Dinner: "entry.dinner",
    Lunch: "entry.lunch",
    "Snack 1": "entry.snack1",
    "Snack 2": "entry.snack2",
} as const;

const isStoredMealLabel = (label: string): label is keyof typeof mealLabelKeys =>
    Object.hasOwn(mealLabelKeys, label);

/** The label to show for an entry. User-written labels are returned unchanged. */
export function entryDisplayLabel(entry: Pick<Entry, "kind" | "label">, locale: Locale): string {
    if (entry.kind === "meal" && isStoredMealLabel(entry.label)) {
        return translate(locale, mealLabelKeys[entry.label]);
    }
    if (entry.kind === "sleep" && entry.label === "Sleep") {
        return translate(locale, "dashboard.sleep");
    }
    return entry.label;
}
