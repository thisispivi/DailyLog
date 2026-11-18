import { describe, expect, it } from "vitest";

import type { Entry } from "@/features/logbook/domain";
import { EMPTY_PROFILE } from "@/features/profile/profile";
import {
    dayBadges,
    profileLine,
    reportDays,
    summaryTiles,
    travelSummary,
    type ReportInput,
} from "@/features/reports/report-input";
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
    dayLogs: [
        { day: "2026-08-30", steps: null, travel: true },
        { day: "2026-08-31", steps: 12_400, travel: false },
    ],
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
    numbers: "dot-comma",
    profile: {
        birthDate: "1990-10-10",
        firstName: "Ada",
        goalDate: null,
        goalWeightGrams: null,
        heightCm: 180,
        lastName: "Rossi",
    },
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
    timeFormat: "24h",
    weightUnit: "kg",
};

describe("report generation", () => {
    it("neutralizes spreadsheet formulas in user text", () => {
        expect(neutralizeSpreadsheetFormula("=2+2")).toBe("'=2+2");
        expect(neutralizeSpreadsheetFormula("+ felt great")).toBe("'+ felt great");
        expect(neutralizeSpreadsheetFormula("Pasta")).toBe("Pasta");
    });

    it("shows activity ranges in the time column and skips days with nothing recorded", () => {
        const days = reportDays(input);
        expect(days.map((day) => day.date)).toEqual(["2026-08-30", "2026-08-31"]);
        expect(days[1]?.rows.find((row) => row.kind === "training")).toMatchObject({
            detail: "30 min",
            time: "23:00–23:30",
        });
        expect(days[1]?.note).toBe("+ felt great");
    });

    it("tags travel days and steps, and averages the logged steps", () => {
        const [travelDay, walkDay] = reportDays(input);
        expect(travelDay && dayBadges(travelDay, input)).toEqual([
            { label: "Giorno di viaggio", tone: "travel" },
        ]);
        expect(walkDay && dayBadges(walkDay, input)).toEqual([
            { label: "12.400 passi", tone: "steps" },
        ]);
        expect(travelSummary(input)).toBe("1 giorno di viaggio");
        expect(summaryTiles(input).find((tile) => tile.label === "Passi al giorno")?.value).toBe(
            "12.400",
        );
    });

    it("describes the person in the export header, skipping what is not set", () => {
        expect(profileLine(input, "2026-10-09")).toBe("Ada Rossi · 35 anni · 180 cm · IMC 22,6");
        expect(
            profileLine({
                ...input,
                profile: EMPTY_PROFILE,
            }),
        ).toBeNull();
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
