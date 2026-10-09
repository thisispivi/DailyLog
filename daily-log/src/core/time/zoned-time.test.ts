import { describe, expect, it } from "vitest";

import { localDateRangeBounds, localDateTimeToUtc } from "@/core/time/zoned-time";

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
