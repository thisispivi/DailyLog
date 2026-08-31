import { describe, expect, it } from "vitest";

import type { Entry } from "@/features/logbook/domain";
import {
    createPdf,
    createWorkbook,
    neutralizeSpreadsheetFormula,
} from "@/features/reports/report-service";

const entry: Entry = {
    createdAt: "2026-08-31T10:00:00+00:00",
    endAt: null,
    id: 1,
    kind: "meal",
    label: "Lunch",
    startAt: "2026-08-31T10:00:00+00:00",
    text: "=2+2",
    updatedAt: "2026-08-31T10:00:00+00:00",
    userId: 42,
};

const input = {
    endDate: "2026-08-31",
    entries: [entry],
    locale: "en" as const,
    startDate: "2026-08-31",
    timeZone: "Europe/Berlin",
    weighIns: [],
    weightUnit: "kg" as const,
};

describe("report generation", () => {
    it("neutralizes spreadsheet formulas in user text", async () => {
        const buffer = await createWorkbook(input);
        expect(buffer.subarray(0, 2).toString()).toBe("PK");
        expect(neutralizeSpreadsheetFormula("=2+2")).toBe("'=2+2");
    });

    it("creates a real PDF document", async () => {
        const buffer = await createPdf(input);
        expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    });
});
