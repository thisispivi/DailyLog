import type { DayNote, Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";

/** Everything an export needs; all lists are oldest first. */
export type ReportInput = Readonly<{
    endDate: string;
    entries: readonly Entry[];
    locale: Locale;
    notes: readonly DayNote[];
    startDate: string;
    timeZone: string;
    weighIns: readonly WeighIn[];
    weightUnit: WeightUnit;
}>;

/** Every calendar date from start to end, inclusive. */
export function datesInRange(startDate: string, endDate: string): string[] {
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    return Array.from({ length: Math.max(days, 0) }, (_, index) =>
        new Date(Date.parse(`${startDate}T12:00:00Z`) + index * 86_400_000)
            .toISOString()
            .slice(0, 10),
    );
}
