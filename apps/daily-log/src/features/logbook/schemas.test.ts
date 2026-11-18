import { describe, expect, it } from "vitest";

import { gramsToUnit, weightToGrams } from "@/features/logbook/domain";
import {
    createEntrySchema,
    createWeighInSchema,
    updateEntrySchema,
    updateSettingsSchema,
    updateWeighInSchema,
} from "@/features/logbook/schemas";

const training = {
    kind: "training",
    label: "Run",
    startAt: "2026-08-31T12:00:00+02:00",
};

describe("weight conversion", () => {
    it("stores kilograms and pounds as integer grams", () => {
        expect(weightToGrams(72.4, "kg")).toBe(72400);
        expect(weightToGrams(160, "lb")).toBe(72575);
    });

    it("round-trips pounds within display precision", () => {
        expect(gramsToUnit(weightToGrams(160, "lb"), "lb")).toBeCloseTo(160, 2);
    });
});

describe("createEntrySchema", () => {
    it("accepts a meal and defaults its details to an empty string", () => {
        const result = createEntrySchema.parse({
            kind: "meal",
            label: " Lunch ",
            startAt: "2026-08-31T12:00:00+02:00",
        });
        expect(result).toMatchObject({ label: "Lunch", text: "" });
    });

    it("rejects meals with an end time", () => {
        const result = createEntrySchema.safeParse({
            ...training,
            endAt: "2026-08-31T13:00:00+02:00",
            kind: "meal",
        });
        expect(result.success).toBe(false);
    });

    it("rejects an end that does not follow the start", () => {
        const result = createEntrySchema.safeParse({
            ...training,
            endAt: "2026-08-31T12:00:00+02:00",
        });
        expect(result.success).toBe(false);
    });

    it("rejects timestamps without an offset", () => {
        expect(
            createEntrySchema.safeParse({ ...training, startAt: "2026-08-31T12:00:00" }).success,
        ).toBe(false);
    });

    it("rejects unknown keys instead of silently dropping them", () => {
        expect(createEntrySchema.safeParse({ ...training, userId: 7 }).success).toBe(false);
    });
});

describe("updateEntrySchema", () => {
    it("leaves omitted fields undefined so a partial update cannot clear them", () => {
        expect(updateEntrySchema.parse({ label: "Walk" })).toEqual({ label: "Walk" });
    });

    it("allows clearing the end time explicitly", () => {
        expect(updateEntrySchema.parse({ endAt: null })).toEqual({ endAt: null });
    });
});

describe("weigh-in schemas", () => {
    it("rejects weights outside 1 to 1000", () => {
        const base = { recordedAt: "2026-08-31T07:00:00+02:00", unit: "kg" };
        expect(createWeighInSchema.safeParse({ ...base, weight: 0.001 }).success).toBe(false);
        expect(createWeighInSchema.safeParse({ ...base, weight: 1001 }).success).toBe(false);
        expect(createWeighInSchema.safeParse({ ...base, weight: 72.4 }).success).toBe(true);
    });

    it("requires a unit when the weight changes", () => {
        expect(updateWeighInSchema.safeParse({ weight: 70 }).success).toBe(false);
        expect(updateWeighInSchema.safeParse({ unit: "lb", weight: 150 }).success).toBe(true);
    });
});

describe("updateSettingsSchema", () => {
    it("requires at least one known setting", () => {
        expect(updateSettingsSchema.safeParse({}).success).toBe(false);
        expect(updateSettingsSchema.safeParse({ theme: "dark" }).success).toBe(true);
        expect(updateSettingsSchema.safeParse({ theme: "sepia" }).success).toBe(false);
    });
});
