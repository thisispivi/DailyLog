import {
    formatMinutes,
    formatNumber,
    formatTime,
    formatWeight,
    type NumberStyle,
    translate,
} from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds, shiftDate } from "@/core/time/zoned-time";
import { clipToDay, dailyTotals, summarizePeriod } from "@/features/insights/insights";
import type {
    DayLog,
    DayNote,
    Entry,
    Locale,
    TimeFormat,
    WeighIn,
    WeightUnit,
} from "@/features/logbook/domain";
import { entryDisplayLabel, loneSnackIds } from "@/features/logbook/entry-label";
import { ageOn, bodyMassIndex, fullName, type UserProfile } from "@/features/profile/profile";
import type { RecordKind } from "@/ui/kind-icon";

/** Everything an export needs; all lists are oldest first. */
export type ReportInput = Readonly<{
    dayLogs: readonly DayLog[];
    endDate: string;
    entries: readonly Entry[];
    locale: Locale;
    notes: readonly DayNote[];
    numbers: NumberStyle;
    profile: UserProfile;
    startDate: string;
    timeFormat: TimeFormat;
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

export type ReportDay = Readonly<{
    date: string;
    note: string | undefined;
    rows: DayRow[];
    steps: number | null;
    travel: boolean;
}>;

/** A tag shown beside a day's heading. */
export type DayBadge = Readonly<{ label: string; tone: "steps" | "travel" }>;

export type SummaryTile = Readonly<{ kind: RecordKind; label: string; value: string }>;

/** Every calendar date from start to end, inclusive. */
function datesInRange(startDate: string, endDate: string): string[] {
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    return Array.from({ length: Math.max(days, 0) }, (_, index) => shiftDate(startDate, index));
}

/**
 * The days that have records, a note, steps, or a travel tag, oldest first. Activities that cross
 * midnight appear on each day with that day's part.
 */
export function reportDays(input: ReportInput, now: Date = new Date()): ReportDay[] {
    const notes = new Map(input.notes.map((note) => [note.day, note.text]));
    const logs = new Map(input.dayLogs.map((log) => [log.day, log]));
    const loneSnacks = loneSnackIds(input.entries, input.timeZone);
    return datesInRange(input.startDate, input.endDate).flatMap((date) => {
        const rows = rowsForDay(input, date, loneSnacks, now);
        const note = notes.get(date);
        const log = logs.get(date);
        return rows.length || note || log
            ? [{ date, note, rows, steps: log?.steps ?? null, travel: log?.travel ?? false }]
            : [];
    });
}

/** The travel tag and the step count of a day, in that order. */
export function dayBadges(day: ReportDay, input: ReportInput): DayBadge[] {
    return [
        ...(day.travel
            ? [{ label: translate(input.locale, "dayLog.travel"), tone: "travel" as const }]
            : []),
        ...(day.steps === null
            ? []
            : [
                  {
                      label: translate(input.locale, "dayLog.stepsCount", {
                          count: formatNumber(day.steps, input.numbers),
                      }),
                      tone: "steps" as const,
                  },
              ]),
    ];
}

/** "2 travel days" for the export header, or null when the period has none. */
export function travelSummary(input: ReportInput): string | null {
    const inPeriod = input.dayLogs.filter(
        (log) => log.travel && log.day >= input.startDate && log.day <= input.endDate,
    ).length;
    return inPeriod ? translate(input.locale, "export.travelDays", { count: inPeriod }) : null;
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
    const bmi = (value: number) => formatNumber(value, input.numbers, { maximumFractionDigits: 1 });
    const parts = [
        fullName(input.profile),
        birthDate
            ? translate(input.locale, "profile.years", { count: ageOn(birthDate, today) })
            : "",
        heightCm ? `${heightCm} cm` : "",
        heightCm && latest
            ? `${translate(input.locale, "profile.bmi")} ${bmi(bodyMassIndex(latest.weightGrams, heightCm))}`
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
    const steps = input.dayLogs.flatMap((log) =>
        log.steps === null || log.day < input.startDate || log.day > input.endDate
            ? []
            : [log.steps],
    );
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
            kind: "training",
            label: t("export.stepsPerDay"),
            value: steps.length
                ? formatNumber(
                      Math.round(steps.reduce((sum, value) => sum + value, 0) / steps.length),
                      input.numbers,
                  )
                : "–",
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
                    : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${formatWeight(Math.abs(change), input.weightUnit, input.numbers)}`,
        },
    ];
}

function rowsForDay(
    input: ReportInput,
    date: string,
    loneSnacks: ReadonlySet<number>,
    now: Date,
): DayRow[] {
    const [dayStart, dayEnd] = localDateRangeBounds(date, date, input.timeZone);
    const time = (value: string) =>
        formatTime(value, input.locale, input.timeZone, input.timeFormat);
    const inDay = (timestamp: string) =>
        Date.parse(timestamp) >= Date.parse(dayStart) && Date.parse(timestamp) < Date.parse(dayEnd);
    const rows: DayRow[] = [];

    for (const entry of input.entries) {
        const title = entryDisplayLabel(entry, input.locale, loneSnacks);
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
            title: formatWeight(weighIn.weightGrams, input.weightUnit, input.numbers),
        });
    }
    return rows.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
