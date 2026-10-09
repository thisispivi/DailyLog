import { describe, expect, it } from "vitest";

import { monthGrid, shiftMonth } from "@/features/calendar/month";

describe("month helpers", () => {
    it("moves across year boundaries", () => {
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    });

    it("fills whole Monday-first weeks around the month", () => {
        // October 2026 starts on a Thursday and ends on a Saturday.
        const grid = monthGrid("2026-10");
        expect(grid[0]).toBe("2026-09-28");
        expect(grid.at(-1)).toBe("2026-11-01");
        expect(grid.length % 7).toBe(0);
        expect(grid).toContain("2026-10-31");
    });

    it("needs no padding when the month starts on a Monday", () => {
        expect(monthGrid("2027-02")[0]).toBe("2027-02-01");
    });
});
