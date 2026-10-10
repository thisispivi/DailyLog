import { describe, expect, it } from "vitest";

import {
    localDateRangeBounds,
    localDateTimeToUtc,
    toTwelveHour,
    toTwentyFourHour,
} from "@/core/time/zoned-time";

describe("zoned time", () => {
    it("converts Berlin summer wall time to UTC", () => {
        expect(localDateTimeToUtc("2026-08-31", "12:30", "Europe/Berlin")).toBe(
            "2026-08-31T10:30:00.000Z",
        );
    });

    it("uses a 23-hour day across the spring DST transition", () => {
        const [start, end] = localDateRangeBounds("2026-03-29", "2026-03-29", "Europe/Berlin");
        expect(Date.parse(end) - Date.parse(start)).toBe(23 * 60 * 60 * 1000);
    });
});

describe("12-hour clock", () => {
    it("round-trips every hour through the 12-hour clock", () => {
        expect(toTwelveHour(0)).toBe(12);
        expect(toTwelveHour(12)).toBe(12);
        expect(toTwelveHour(13)).toBe(1);
        expect(toTwentyFourHour(12, false)).toBe(0);
        expect(toTwentyFourHour(12, true)).toBe(12);
        for (let hour = 0; hour < 24; hour++) {
            expect(toTwentyFourHour(toTwelveHour(hour), hour >= 12)).toBe(hour);
        }
    });
});
