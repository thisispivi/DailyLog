import { localDateInZone, localDateRangeBounds, shiftDate } from "@/core/time/zoned-time";
import { entryDurationMs, type Entry, type WeighIn } from "@/features/logbook/domain";

export type DayTotals = Readonly<{
    activeMinutes: number;
    date: string;
    meals: number;
    sleepMinutes: number;
    /** The last weigh-in of the day, or null. */
    weightGrams: number | null;
}>;

export type DaySegment = Readonly<{
    endAt: string | null;
    /** The entry started on an earlier day; this day shows it from midnight. */
    fromPreviousDay: boolean;
    /** The entry runs past this day; this day shows it until midnight. */
    intoNextDay: boolean;
    startAt: string;
}>;

/**
 * The part of an entry that falls inside one day, given the day's UTC bounds.
 * A walk from 23:28 to 00:32 shows as 23:28 to midnight on the first day and
 * midnight to 00:32 on the next. An activity still running stays open (null end)
 * on the current day and is capped at midnight on earlier days.
 */
export function clipToDay(
    entry: Pick<Entry, "endAt" | "startAt">,
    dayStart: string,
    dayEnd: string,
    now: Date = new Date(),
): DaySegment {
    const start = Math.max(Date.parse(entry.startAt), Date.parse(dayStart));
    const end = entry.endAt ? Date.parse(entry.endAt) : now.getTime();
    const dayEndMs = Date.parse(dayEnd);
    const intoNextDay = end > dayEndMs;
    return {
        endAt: intoNextDay
            ? new Date(dayEndMs).toISOString()
            : entry.endAt
              ? new Date(end).toISOString()
              : null,
        fromPreviousDay: Date.parse(entry.startAt) < Date.parse(dayStart),
        intoNextDay,
        startAt: new Date(start).toISOString(),
    };
}

/**
 * Per-day totals for the given local dates. Meals count on the day they are
 * eaten and training is split at midnight, so each day gets only its own
 * minutes. Sleep counts on the day you wake up: a night belongs to the morning
 * after it.
 */
export function dailyTotals(
    dates: readonly string[],
    entries: readonly Entry[],
    weighIns: readonly WeighIn[],
    timeZone: string,
): DayTotals[] {
    const totals = new Map(
        dates.map((date) => [
            date,
            {
                activeMinutes: 0,
                date,
                meals: 0,
                sleepMinutes: 0,
                weightGrams: null as number | null,
            },
        ]),
    );
    const dayOf = (timestamp: string) => totals.get(localDateInZone(new Date(timestamp), timeZone));

    for (const entry of entries) {
        if (entry.kind === "meal") {
            const day = dayOf(entry.startAt);
            if (day) day.meals += 1;
        } else if (entry.kind === "training") {
            if (!entry.endAt) continue;
            for (const [date, day] of totals) {
                const [dayStart, dayEnd] = localDateRangeBounds(date, date, timeZone);
                const overlap =
                    Math.min(Date.parse(entry.endAt), Date.parse(dayEnd)) -
                    Math.max(Date.parse(entry.startAt), Date.parse(dayStart));
                if (overlap > 0) day.activeMinutes += overlap / 60_000;
            }
        } else if (entry.endAt) {
            const day = dayOf(entry.endAt);
            if (day) day.sleepMinutes += entryDurationMs(entry) / 60_000;
        }
    }
    const oldestFirst = [...weighIns].sort((left, right) =>
        left.recordedAt.localeCompare(right.recordedAt),
    );
    for (const weighIn of oldestFirst) {
        const day = dayOf(weighIn.recordedAt);
        if (day) day.weightGrams = weighIn.weightGrams;
    }
    return dates.map((date) => {
        const day = totals.get(date);
        if (!day) throw new Error(`Missing totals for ${date}.`);
        return {
            ...day,
            activeMinutes: Math.round(day.activeMinutes),
            sleepMinutes: Math.round(day.sleepMinutes),
        };
    });
}

export type PeriodSummary = Readonly<{
    activeMinutes: number;
    /** Average over nights with recorded sleep; null when none were recorded. */
    averageSleepMinutes: number | null;
    mealsPerDay: number;
    /** Last weigh-in minus first weigh-in in the period; null with fewer than two. */
    weightChangeGrams: number | null;
}>;

export function summarizePeriod(days: readonly DayTotals[]): PeriodSummary {
    const nights = days.filter((day) => day.sleepMinutes > 0);
    const weights = days.flatMap((day) => (day.weightGrams === null ? [] : [day.weightGrams]));
    const first = weights[0];
    const last = weights.at(-1);
    const meals = days.reduce((sum, day) => sum + day.meals, 0);
    return {
        activeMinutes: days.reduce((sum, day) => sum + day.activeMinutes, 0),
        averageSleepMinutes: nights.length
            ? Math.round(nights.reduce((sum, day) => sum + day.sleepMinutes, 0) / nights.length)
            : null,
        mealsPerDay: days.length ? Math.round((meals / days.length) * 10) / 10 : 0,
        weightChangeGrams:
            weights.length >= 2 && first !== undefined && last !== undefined ? last - first : null,
    };
}

/**
 * Consecutive days with at least one record, counting back from today. An empty
 * today does not break the streak yet; it only stops counting at yesterday.
 */
export function loggingStreak(recordDates: ReadonlySet<string>, today: string): number {
    let day = recordDates.has(today) ? today : shiftDate(today, -1);
    let streak = 0;
    while (recordDates.has(day)) {
        streak += 1;
        day = shiftDate(day, -1);
    }
    return streak;
}

export const mealLabels = ["Breakfast", "Snack 1", "Lunch", "Snack 2", "Dinner"] as const;
export type MealLabel = (typeof mealLabels)[number];

/** The meal you are most likely logging at this local hour. */
export function mealLabelForHour(hour: number): MealLabel {
    if (hour < 10) return "Breakfast";
    if (hour < 12) return "Snack 1";
    if (hour < 15) return "Lunch";
    if (hour < 18) return "Snack 2";
    return "Dinner";
}

export type ActivityTotal = Readonly<{ label: string; minutes: number }>;

/** Minutes of finished training per activity label, longest first. */
export function trainingMinutesByLabel(entries: readonly Entry[], limit = 5): ActivityTotal[] {
    const totals = new Map<string, number>();
    for (const entry of entries) {
        if (entry.kind !== "training") continue;
        totals.set(entry.label, (totals.get(entry.label) ?? 0) + entryDurationMs(entry) / 60_000);
    }
    return [...totals]
        .map(([label, minutes]) => ({ label, minutes: Math.round(minutes) }))
        .filter((total) => total.minutes > 0)
        .sort((left, right) => right.minutes - left.minutes)
        .slice(0, limit);
}
