import { describe, expect, it } from "vitest";

import { backupSchema } from "@/features/backup/schemas";

const backup = {
    app: "DailyLog",
    entries: [
        {
            endAt: null,
            kind: "meal",
            label: "Lunch",
            startAt: "2026-08-31T10:00:00+00:00",
            text: "",
        },
    ],
    exportedAt: "2026-09-01T00:00:00+00:00",
    notes: [{ day: "2026-08-31", text: "Felt good" }],
    profile: { birthDate: null, firstName: "", heightCm: null, lastName: "" },
    settings: { exportLocale: "en", locale: "en", theme: "system", weightUnit: "kg" },
    version: 1,
    weighIns: [{ recordedAt: "2026-08-31T07:00:00+00:00", weightGrams: 73_200 }],
};

describe("backup schema", () => {
    it("accepts an exported backup", () => {
        expect(backupSchema.parse(backup)).toEqual(backup);
    });

    it("rejects other files, unknown versions, and invalid records", () => {
        expect(backupSchema.safeParse({ ...backup, app: "Other" }).success).toBe(false);
        expect(backupSchema.safeParse({ ...backup, version: 2 }).success).toBe(false);
        expect(backupSchema.safeParse({ ...backup, extra: true }).success).toBe(false);
        expect(
            backupSchema.safeParse({
                ...backup,
                entries: [{ ...backup.entries[0], endAt: "2026-08-31T11:00:00+00:00" }],
            }).success,
        ).toBe(false);
    });
});
