import { describe, expect, it } from "vitest";

import { summarizeDay } from "@/features/dashboard/dashboard-summary";
import type { Entry } from "@/features/logbook/domain";

const base: Entry = {
    createdAt: "2026-08-31T00:00:00+00:00",
    endAt: null,
    id: 1,
    kind: "meal",
    label: "Lunch",
    startAt: "2026-08-31T10:00:00+00:00",
    text: "",
    updatedAt: "2026-08-31T00:00:00+00:00",
    userId: 42,
};

describe("dashboard summary", () => {
    it("counts records and totals only completed activity durations", () => {
        const summary = summarizeDay(
            [
                base,
                {
                    ...base,
                    endAt: "2026-08-31T11:30:00+00:00",
                    id: 2,
                    kind: "training",
                    label: "Run",
                },
                {
                    ...base,
                    endAt: "2026-08-31T18:00:00+00:00",
                    id: 3,
                    kind: "sleep",
                    label: "Sleep",
                },
            ],
            [],
        );
        expect(summary).toMatchObject({ count: 3, sleepHours: 8, trainingMinutes: 90 });
    });
});
