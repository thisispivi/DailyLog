import { describe, expect, it } from "vitest";

import type { Entry } from "@/features/logbook/domain";
import type { ReportInput } from "@/features/reports/report-input";
import { createPdf } from "@/features/reports/pdf-report";
import { createWorkbook, neutralizeSpreadsheetFormula } from "@/features/reports/workbook";

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

const input: ReportInput = {
    endDate: "2026-08-31",
    entries: [
        entry,
        {
            ...entry,
            endAt: "2026-08-31T21:30:00+00:00",
            id: 2,
            kind: "training",
            label: "Run",
            startAt: "2026-08-31T21:00:00+00:00",
            text: "",
        },
    ],
    locale: "it",
    notes: [{ day: "2026-08-31", text: "+ felt great", updatedAt: "2026-08-31T22:00:00+00:00" }],
    startDate: "2026-08-30",
    timeZone: "Europe/Berlin",
    weighIns: [
        {
            createdAt: "2026-08-31T05:00:00+00:00",
            id: 1,
            recordedAt: "2026-08-31T05:00:00+00:00",
            updatedAt: "2026-08-31T05:00:00+00:00",
            userId: 42,
            weightGrams: 73_200,
        },
    ],
    weightUnit: "kg",
};

describe("report generation", () => {
    it("neutralizes spreadsheet formulas in user text", () => {
        expect(neutralizeSpreadsheetFormula("=2+2")).toBe("'=2+2");
        expect(neutralizeSpreadsheetFormula("+ felt great")).toBe("'+ felt great");
        expect(neutralizeSpreadsheetFormula("Pasta")).toBe("Pasta");
    });

    it("creates a real XLSX workbook with summary, journal, weight, and notes", async () => {
        const buffer = await createWorkbook(input);
        expect(buffer.subarray(0, 2).toString()).toBe("PK");
    });

    it("creates a real PDF document", async () => {
        const buffer = await createPdf(input);
        expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    });
});
