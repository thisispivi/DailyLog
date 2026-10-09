import { describe, expect, it } from "vitest";

import { datesEndingOn } from "@/core/time/zoned-time";
import type { Entry, WeighIn } from "@/features/logbook/domain";
import {
    dailyTotals,
    loggingStreak,
    mealLabelForHour,
    summarizePeriod,
    trainingMinutesByLabel,
} from "@/features/insights/insights";

const TZ = "Europe/Berlin";

function entry(overrides: Partial<Entry>): Entry {
    return {
        createdAt: "2026-10-01T00:00:00+00:00",
        endAt: null,
        id: 1,
        kind: "meal",
        label: "Lunch",
        startAt: "2026-10-07T11:00:00+00:00",
        text: "",
        updatedAt: "2026-10-01T00:00:00+00:00",
        userId: 42,
        ...overrides,
    };
}

function weighIn(recordedAt: string, weightGrams: number): WeighIn {
    return {
        createdAt: recordedAt,
        id: 1,
        recordedAt,
        updatedAt: recordedAt,
        userId: 42,
        weightGrams,
    };
}

describe("dailyTotals", () => {
    const dates = ["2026-10-07", "2026-10-08"];

    it("credits a night of sleep to the morning you wake up", () => {
        const [first, second] = dailyTotals(
            dates,
            [
                entry({
                    endAt: "2026-10-08T05:00:00+00:00",
                    kind: "sleep",
                    startAt: "2026-10-07T21:00:00+00:00",
                }),
            ],
            [],
            TZ,
        );
        expect(first?.sleepMinutes).toBe(0);
        expect(second?.sleepMinutes).toBe(480);
    });

    it("uses local dates, so a late-evening meal stays on its own day", () => {
        // 23:30 in Berlin is 21:30 UTC on the same date.
        const [first] = dailyTotals(
            dates,
            [entry({ startAt: "2026-10-07T21:30:00+00:00" })],
            [],
            TZ,
        );
        expect(first?.meals).toBe(1);
    });

    it("ignores open activities and keeps the last weigh-in of each day", () => {
        const [first] = dailyTotals(
            dates,
            [entry({ kind: "training", label: "Run" })],
            [
                weighIn("2026-10-07T18:00:00+00:00", 73_400),
                weighIn("2026-10-07T05:00:00+00:00", 73_900),
            ],
            TZ,
        );
        expect(first).toMatchObject({ activeMinutes: 0, weightGrams: 73_400 });
    });
});

describe("summarizePeriod", () => {
    it("averages sleep over recorded nights only and reports the weight change", () => {
        const summary = summarizePeriod([
            { activeMinutes: 30, date: "a", meals: 3, sleepMinutes: 420, weightGrams: 74_000 },
            { activeMinutes: 0, date: "b", meals: 2, sleepMinutes: 0, weightGrams: null },
            { activeMinutes: 45, date: "c", meals: 3, sleepMinutes: 480, weightGrams: 73_500 },
        ]);
        expect(summary).toEqual({
            activeMinutes: 75,
            averageSleepMinutes: 450,
            mealsPerDay: 2.7,
            weightChangeGrams: -500,
        });
    });

    it("returns nulls when there is nothing to average", () => {
        const summary = summarizePeriod([
            { activeMinutes: 0, date: "a", meals: 0, sleepMinutes: 0, weightGrams: 74_000 },
        ]);
        expect(summary).toMatchObject({ averageSleepMinutes: null, weightChangeGrams: null });
    });
});

describe("loggingStreak", () => {
    const logged = new Set(datesEndingOn("2026-10-07", 5));

    it("counts consecutive days back from today", () => {
        expect(loggingStreak(new Set([...logged, "2026-10-08"]), "2026-10-08")).toBe(6);
    });

    it("keeps yesterday's streak while today is still empty", () => {
        expect(loggingStreak(logged, "2026-10-08")).toBe(5);
    });

    it("is zero after a missed day", () => {
        expect(loggingStreak(logged, "2026-10-09")).toBe(0);
    });
});

describe("mealLabelForHour", () => {
    it("suggests the meal for the time of day", () => {
        expect([7, 11, 13, 16, 20].map(mealLabelForHour)).toEqual([
            "Breakfast",
            "Snack 1",
            "Lunch",
            "Snack 2",
            "Dinner",
        ]);
    });
});

describe("trainingMinutesByLabel", () => {
    it("adds finished sessions per activity, longest first, and skips open ones", () => {
        const run = (start: string, end: string | null) =>
            entry({ endAt: end, kind: "training", label: "Run", startAt: start });
        expect(
            trainingMinutesByLabel([
                run("2026-10-07T06:00:00+00:00", "2026-10-07T06:30:00+00:00"),
                run("2026-10-08T06:00:00+00:00", "2026-10-08T06:45:00+00:00"),
                run("2026-10-08T18:00:00+00:00", null),
                entry({
                    endAt: "2026-10-08T19:00:00+00:00",
                    kind: "training",
                    label: "Gym",
                    startAt: "2026-10-08T18:00:00+00:00",
                }),
            ]),
        ).toEqual([
            { label: "Run", minutes: 75 },
            { label: "Gym", minutes: 60 },
        ]);
    });
});
