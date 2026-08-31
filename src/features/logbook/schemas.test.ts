import { describe, expect, it } from "vitest";

import { createEntrySchema, weightToGrams } from "@/features/logbook/schemas";

describe("logbook validation", () => {
    it("converts pounds and kilograms to canonical integer grams", () => {
        expect(weightToGrams(72.4, "kg")).toBe(72400);
        expect(weightToGrams(160, "lb")).toBe(72575);
    });

    it("rejects invalid temporal ranges and meal end times", () => {
        expect(
            createEntrySchema.safeParse({
                endAt: "2026-08-31T13:00:00+02:00",
                kind: "meal",
                label: "Lunch",
                startAt: "2026-08-31T12:00:00+02:00",
                text: "",
            }).success,
        ).toBe(false);
        expect(
            createEntrySchema.safeParse({
                endAt: "2026-08-31T11:00:00+02:00",
                kind: "training",
                label: "Run",
                startAt: "2026-08-31T12:00:00+02:00",
                text: "",
            }).success,
        ).toBe(false);
    });
});
