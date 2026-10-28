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
    profile: {
        birthDate: null,
        firstName: "",
        goalDate: "2026-12-31",
        goalSetAt: "2026-01-05T08:00:00.000+00:00",
        goalWeightGrams: 70_000,
        heightCm: null,
        lastName: "",
    },
    settings: {
        exportLocale: "en",
        locale: "en",
        theme: "system",
        timeFormat: "12h",
        weightUnit: "kg",
    },
    version: 1,
    weighIns: [{ recordedAt: "2026-08-31T07:00:00+00:00", weightGrams: 73_200 }],
};

describe("backup schema", () => {
    it("accepts an exported backup", () => {
        expect(backupSchema.parse(backup)).toEqual(backup);
    });

    it("reads backups made before the time format existed as 24-hour", () => {
        const legacy = { ...backup, settings: { ...backup.settings, timeFormat: undefined } };
        expect(backupSchema.parse(legacy).settings.timeFormat).toBe("24h");
    });

    it("reads backups made before weight goals existed as having no goal", () => {
        const legacy = {
            ...backup,
            profile: {
                ...backup.profile,
                goalDate: undefined,
                goalSetAt: undefined,
                goalWeightGrams: undefined,
            },
        };
        expect(backupSchema.parse(legacy).profile).toMatchObject({
            goalDate: null,
            goalSetAt: null,
            goalWeightGrams: null,
        });
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

    it("applies the same record rules as the API", () => {
        const entry = backup.entries[0];
        const variants = [
            { entries: [{ ...entry, label: "x".repeat(121) }] },
            { entries: [{ ...entry, userId: 7 }] },
            { profile: { ...backup.profile, birthDate: "2999-01-01" } },
            { settings: { ...backup.settings, theme: "sepia" } },
        ];
        for (const variant of variants) {
            expect(backupSchema.safeParse({ ...backup, ...variant }).success).toBe(false);
        }
    });
});
