import { describe, expect, it } from "vitest";

import { niceTicks, timeTicks } from "@/features/reports/chart-scale";

describe("niceTicks", () => {
    it("uses round steps around a narrow weight range", () => {
        expect(niceTicks(73.2, 74.3)).toEqual([72.5, 73, 73.5, 74, 74.5, 75]);
    });

    it("widens the step for a broad range and still covers both ends", () => {
        const ticks = niceTicks(120, 134.5);
        expect(ticks[0]).toBeLessThanOrEqual(120);
        expect(ticks.at(-1)).toBeGreaterThanOrEqual(134.5);
        expect(ticks.length).toBeLessThanOrEqual(7);
    });

    it("gives a single weigh-in some room", () => {
        expect(niceTicks(73, 73)).toEqual([72.5, 73, 73.5]);
    });
});

describe("timeTicks", () => {
    const day = 86_400_000;

    it("spreads a few whole-day ticks over a long range", () => {
        const ticks = timeTicks(0, 42 * day);
        expect(ticks).toEqual([0, 11 * day, 22 * day, 33 * day]);
    });

    it("never goes below one tick per day", () => {
        expect(timeTicks(0, 2 * day)).toEqual([0, day, 2 * day]);
    });
});
