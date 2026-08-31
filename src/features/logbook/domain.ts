export const entryKinds = ["meal", "training", "sleep"] as const;
export type EntryKind = (typeof entryKinds)[number];

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

export type TrashItem = Readonly<{
    deletedAt: string;
    label: string;
    recordId: number;
    recordType: "entry" | "weighIn";
}>;

export type Locale = "en" | "it";
export type Theme = "light" | "dark" | "system";
export type WeightUnit = "kg" | "lb";

export type EntryFilters = Readonly<{
    from?: string;
    kind?: EntryKind;
    limit: number;
    offset: number;
    query?: string;
    to?: string;
}>;
