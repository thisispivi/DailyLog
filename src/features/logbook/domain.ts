export const entryKinds = ["meal", "training", "sleep"] as const;
export type EntryKind = (typeof entryKinds)[number];

export const locales = ["en", "it"] as const;
export type Locale = (typeof locales)[number];

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const weightUnits = ["kg", "lb"] as const;
export type WeightUnit = (typeof weightUnits)[number];

export const GRAMS_PER_POUND = 453.59237;

/** Deleted records stay restorable for this long before they are purged. */
export const TRASH_RETENTION_DAYS = 30;

export type Entry = Readonly<{
    createdAt: string;
    endAt: string | null;
    id: number;
    kind: EntryKind;
    label: string;
    startAt: string;
    text: string;
    updatedAt: string;
    userId: number;
}>;

export type WeighIn = Readonly<{
    createdAt: string;
    id: number;
    recordedAt: string;
    updatedAt: string;
    userId: number;
    weightGrams: number;
}>;

export type UserSettings = Readonly<{
    exportLocale: Locale;
    locale: Locale;
    theme: Theme;
    userId: number;
    weightUnit: WeightUnit;
}>;

export type TrashItem = Readonly<
    { deletedAt: string; recordId: number } & (
        | { kind: EntryKind; label: string; recordType: "entry" }
        | { recordType: "weighIn"; weightGrams: number }
    )
>;

export type EntryFilters = Readonly<{
    from?: string;
    kind?: EntryKind;
    limit: number;
    offset: number;
    query?: string;
    to?: string;
}>;

export class RecordNotFoundError extends Error {}

/** Only one training or sleep session may be open at a time. */
export class DuplicateOpenActivityError extends Error {}

/** An entry whose end does not follow its start. */
export class InvalidEntryRangeError extends Error {}

export function weightToGrams(weight: number, unit: WeightUnit): number {
    return Math.round(unit === "kg" ? weight * 1000 : weight * GRAMS_PER_POUND);
}

export function gramsToUnit(grams: number, unit: WeightUnit): number {
    return unit === "kg" ? grams / 1000 : grams / GRAMS_PER_POUND;
}

/** Elapsed time of a finished activity; open activities and meals count as zero. */
export function entryDurationMs(entry: Pick<Entry, "endAt" | "startAt">): number {
    if (!entry.endAt) return 0;
    return Math.max(0, Date.parse(entry.endAt) - Date.parse(entry.startAt));
}
