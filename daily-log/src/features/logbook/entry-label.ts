import { translate } from "@/core/i18n/translate";
import { localDateInZone } from "@/core/time/zoned-time";
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

const isNumberedSnack = (entry: Pick<Entry, "kind" | "label">) =>
    entry.kind === "meal" && (entry.label === "Snack 1" || entry.label === "Snack 2");

/** Ids of numbered snacks that are the only snack on their local day, so the number adds nothing. */
export function loneSnackIds(
    entries: readonly Pick<Entry, "id" | "kind" | "label" | "startAt">[],
    timeZone: string,
): ReadonlySet<number> {
    const snacksByDay = new Map<string, number[]>();
    for (const entry of entries) {
        if (!isNumberedSnack(entry)) continue;
        const day = localDateInZone(new Date(entry.startAt), timeZone);
        snacksByDay.set(day, [...(snacksByDay.get(day) ?? []), entry.id]);
    }
    return new Set([...snacksByDay.values()].flatMap((ids) => (ids.length === 1 ? ids : [])));
}

/**
 * The label to show for an entry. User-written labels are returned unchanged.
 * Pass `loneSnacks` from {@link loneSnackIds} to drop the number from a day's only snack.
 */
export function entryDisplayLabel(
    entry: Pick<Entry, "kind" | "label"> & Partial<Pick<Entry, "id">>,
    locale: Locale,
    loneSnacks?: ReadonlySet<number>,
): string {
    if (entry.id !== undefined && loneSnacks?.has(entry.id) && isNumberedSnack(entry)) {
        return translate(locale, "entry.snack");
    }
    if (entry.kind === "meal" && isStoredMealLabel(entry.label)) {
        return translate(locale, mealLabelKeys[entry.label]);
    }
    if (entry.kind === "sleep" && entry.label === "Sleep") {
        return translate(locale, "dashboard.sleep");
    }
    return entry.label;
}
