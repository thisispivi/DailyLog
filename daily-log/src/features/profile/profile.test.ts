import { describe, expect, it } from "vitest";

import type { WeighIn } from "@/features/logbook/domain";
import {
    ageOn,
    bmiCategory,
    bodyMassIndex,
    EMPTY_PROFILE,
    fullName,
    weightGoalProgress,
} from "@/features/profile/profile";
import { updateProfileSchema } from "@/features/profile/schemas";

describe("profile", () => {
    it("counts a year of age only once the birthday has passed", () => {
        expect(ageOn("1990-10-10", "2026-10-09")).toBe(35);
        expect(ageOn("1990-10-10", "2026-10-10")).toBe(36);
        expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    });

    it("computes BMI and its WHO category", () => {
        expect(bodyMassIndex(73_200, 180)).toBe(22.6);
        expect(bmiCategory(18.4)).toBe("underweight");
        expect(bmiCategory(22.6)).toBe("healthy");
        expect(bmiCategory(25)).toBe("overweight");
        expect(bmiCategory(30)).toBe("obese");
    });

    it("joins only the names that are set", () => {
        expect(fullName({ ...EMPTY_PROFILE, firstName: "Ada" })).toBe("Ada");
    });

    it("accepts partial changes and clearing, and rejects bad values", () => {
        expect(updateProfileSchema.parse({ firstName: "  Ada " })).toEqual({ firstName: "Ada" });
        expect(updateProfileSchema.parse({ birthDate: null, heightCm: null })).toEqual({
            birthDate: null,
            heightCm: null,
        });
        expect(updateProfileSchema.safeParse({}).success).toBe(false);
        expect(updateProfileSchema.safeParse({ heightCm: 20 }).success).toBe(false);
        expect(updateProfileSchema.safeParse({ birthDate: "2999-01-01" }).success).toBe(false);
        expect(updateProfileSchema.safeParse({ nickname: "x" }).success).toBe(false);
    });
});

describe("weight goal progress", () => {
    const DAY = 86_400_000;
    const at = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * DAY).toISOString();
    const weighIn = (day: number, weightGrams: number): WeighIn => ({
        createdAt: at(day),
        id: day,
        recordedAt: at(day),
        updatedAt: at(day),
        userId: 1,
        weightGrams,
    });
    // Losing 500 g a week from 80 kg, one weigh-in a week for five weeks.
    const weighIns = [0, 7, 14, 21, 28].map((day, week) => weighIn(day, 80_000 - week * 500));

    it("measures from the weight when the goal was set and projects the recent pace", () => {
        const progress = weightGoalProgress(
            weighIns,
            { date: "2026-03-01", setAt: at(7), weightGrams: 75_000 },
            Date.parse(at(28)),
        );
        expect(progress).toMatchObject({
            changeGrams: -1500,
            currentGrams: 78_000,
            progress: 1500 / 4500,
            reached: false,
            remainingGrams: -3000,
            startGrams: 79_500,
        });
        expect(progress?.weeklyPaceGrams).toBeCloseTo(-500);
        // 3 kg to go at 500 g a week is six more weeks.
        expect(progress?.estimatedAt).toBe(Date.parse(at(28 + 42)));
        // 31 days left to 1 March.
        expect(progress?.neededWeeklyGrams).toBeCloseTo(-3000 / (31 / 7));
    });

    it("gives no estimate when the trend moves away from the goal or spans under a week", () => {
        const gaining = weightGoalProgress(
            weighIns,
            { date: null, setAt: null, weightGrams: 82_000 },
            Date.parse(at(28)),
        );
        expect(gaining?.estimatedAt).toBeNull();
        expect(gaining?.neededWeeklyGrams).toBeNull();
        const short = weightGoalProgress(
            [weighIn(0, 80_000), weighIn(3, 79_800)],
            { date: null, setAt: null, weightGrams: 75_000 },
            Date.parse(at(3)),
        );
        expect(short?.weeklyPaceGrams).toBeNull();
    });

    it("caps progress once the goal is reached and needs a weigh-in to start", () => {
        const reached = weightGoalProgress(
            weighIns,
            { date: "2026-01-10", setAt: null, weightGrams: 79_000 },
            Date.parse(at(28)),
        );
        expect(reached).toMatchObject({ progress: 1, reached: true, neededWeeklyGrams: null });
        expect(
            weightGoalProgress([], { date: null, setAt: null, weightGrams: 70_000 }, 0),
        ).toBeNull();
    });
});
