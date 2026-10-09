import { formatMinutes, formatTime, formatWeight, translate } from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { clipToDay, dailyTotals, summarizePeriod } from "@/features/insights/insights";
import type { DayNote, Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";
import { entryDisplayLabel } from "@/features/logbook/entry-label";
import { ageOn, bodyMassIndex, fullName, type UserProfile } from "@/features/profile/profile";
import type { RecordKind } from "@/ui/kind-icon";

/** Everything an export needs; all lists are oldest first. */
export type ReportInput = Readonly<{
    endDate: string;
    entries: readonly Entry[];
    locale: Locale;
    notes: readonly DayNote[];
    profile: UserProfile;
    startDate: string;
    timeZone: string;
    weighIns: readonly WeighIn[];
    weightUnit: WeightUnit;
}>;

/** One line of a day in the PDF and the spreadsheet. `time` is a range for activities and sleep. */
export type DayRow = Readonly<{
    at: string;
    detail: string;
    kind: RecordKind;
    time: string;
    title: string;
}>;

export type ReportDay = Readonly<{ date: string; note: string | undefined; rows: DayRow[] }>;

export type SummaryTile = Readonly<{ kind: RecordKind; label: string; value: string }>;

/** Every calendar date from start to end, inclusive. */
export function datesInRange(startDate: string, endDate: string): string[] {
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    return Array.from({ length: Math.max(days, 0) }, (_, index) =>
        new Date(Date.parse(`${startDate}T12:00:00Z`) + index * 86_400_000)
            .toISOString()
            .slice(0, 10),
    );
}

/**
 * The days that have records or a note, oldest first. Activities that cross
 * midnight appear on each day with that day's part.
 */
export function reportDays(input: ReportInput, now: Date = new Date()): ReportDay[] {
    const notes = new Map(input.notes.map((note) => [note.day, note.text]));
    return datesInRange(input.startDate, input.endDate).flatMap((date) => {
        const rows = rowsForDay(input, date, now);
        const note = notes.get(date);
        return rows.length || note ? [{ date, note, rows }] : [];
    });
}

/**
 * "Ada Rossi · 35 years · 180 cm · BMI 22.6" for the export header, from what the
 * profile has set. BMI uses the period's last weigh-in. Null when nothing is set.
 */
export function profileLine(
    input: ReportInput,
    today: string = localDateInZone(new Date(), input.timeZone),
): string | null {
    const { birthDate, heightCm } = input.profile;
    const latest = input.weighIns.at(-1);
    const number = new Intl.NumberFormat(input.locale, { maximumFractionDigits: 1 });
    const parts = [
        fullName(input.profile),
        birthDate
            ? translate(input.locale, "profile.years", { count: ageOn(birthDate, today) })
            : "",
        heightCm ? `${heightCm} cm` : "",
        heightCm && latest
            ? `${translate(input.locale, "profile.bmi")} ${number.format(bodyMassIndex(latest.weightGrams, heightCm))}`
            : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

/** The period's key figures, shown at the top of both exports. */
export function summaryTiles(input: ReportInput): SummaryTile[] {
    const t = (key: Parameters<typeof translate>[1]) => translate(input.locale, key);
    const dates = datesInRange(input.startDate, input.endDate);
    const days = dailyTotals(dates, input.entries, input.weighIns, input.timeZone);
    const summary = summarizePeriod(days);
    const change = summary.weightChangeGrams;
    return [
        {
            kind: "meal",
            label: t("export.totalMeals"),
            value: String(days.reduce((sum, day) => sum + day.meals, 0)),
        },
        {
            kind: "training",
            label: t("reports.activeTime"),
            value: formatMinutes(summary.activeMinutes, input.locale),
        },
        {
            kind: "sleep",
            label: t("reports.averageSleep"),
            value:
                summary.averageSleepMinutes === null
                    ? "–"
                    : formatMinutes(summary.averageSleepMinutes, input.locale),
        },
        {
            kind: "weight",
            label: t("reports.weightChange"),
            value:
                change === null
                    ? "–"
                    : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${formatWeight(Math.abs(change), input.weightUnit, input.locale)}`,
        },
    ];
}

function rowsForDay(input: ReportInput, date: string, now: Date): DayRow[] {
    const [dayStart, dayEnd] = localDateRangeBounds(date, date, input.timeZone);
    const time = (value: string) => formatTime(value, input.locale, input.timeZone);
    const inDay = (timestamp: string) =>
        Date.parse(timestamp) >= Date.parse(dayStart) && Date.parse(timestamp) < Date.parse(dayEnd);
    const rows: DayRow[] = [];

    for (const entry of input.entries) {
        const title = entryDisplayLabel(entry, input.locale);
        if (entry.kind === "meal") {
            if (inDay(entry.startAt)) {
                rows.push({
                    at: entry.startAt,
                    detail: entry.text,
                    kind: "meal",
                    time: time(entry.startAt),
                    title,
                });
            }
            continue;
        }
        const end = entry.endAt ?? now.toISOString();
        if (
            Date.parse(entry.startAt) >= Date.parse(dayEnd) ||
            Date.parse(end) <= Date.parse(dayStart)
        ) {
            continue;
        }
        const segment = clipToDay(entry, dayStart, dayEnd, now);
        const until = segment.intoNextDay
            ? time(new Date(Date.parse(dayEnd) - 60_000).toISOString())
            : segment.endAt
              ? time(segment.endAt)
              : "…";
        const minutes = (Date.parse(segment.endAt ?? end) - Date.parse(segment.startAt)) / 60_000;
        const length = segment.endAt
            ? formatMinutes(minutes, input.locale)
            : translate(input.locale, "dashboard.inProgress");
        rows.push({
            at: segment.startAt,
            detail: [length, entry.text].filter(Boolean).join(" · "),
            kind: entry.kind,
            time: `${time(segment.startAt)}–${until}`,
            title,
        });
    }

    for (const weighIn of input.weighIns) {
        if (!inDay(weighIn.recordedAt)) continue;
        rows.push({
            at: weighIn.recordedAt,
            detail: "",
            kind: "weight",
            time: time(weighIn.recordedAt),
            title: formatWeight(weighIn.weightGrams, input.weightUnit, input.locale),
        });
    }
    return rows.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
