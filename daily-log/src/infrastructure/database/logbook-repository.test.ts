import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    DuplicateOpenActivityError,
    InvalidEntryRangeError,
    RecordNotFoundError,
} from "@/features/logbook/domain";
import { migrateDatabase } from "@/infrastructure/database/client";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

const OWNER = 42;
const STRANGER = 7;

describe("LogbookRepository", () => {
    let database: Database.Database;
    let logbook: LogbookRepository;

    beforeEach(() => {
        database = new Database(":memory:");
        migrateDatabase(database);
        logbook = new LogbookRepository(database);
    });

    afterEach(() => database.close());

    const startRun = () =>
        logbook.createEntry(OWNER, {
            kind: "training",
            label: "Run",
            startAt: "2026-08-31T08:00:00+02:00",
            text: "",
        });

    it("enforces one open activity per owner", () => {
        const activity = startRun();
        expect(logbook.activeActivity(OWNER)?.id).toBe(activity.id);
        expect(logbook.activeActivity(STRANGER)).toBeNull();
        expect(() =>
            logbook.createEntry(OWNER, {
                kind: "sleep",
                label: "Sleep",
                startAt: "2026-08-31T22:00:00+02:00",
                text: "",
            }),
        ).toThrow(DuplicateOpenActivityError);
    });

    it("never exposes or changes another owner's records", () => {
        const activity = startRun();
        expect(() => logbook.getEntry(STRANGER, activity.id)).toThrow(RecordNotFoundError);
        expect(() => logbook.softDeleteEntry(STRANGER, activity.id)).toThrow(RecordNotFoundError);
        expect(logbook.listEntries(STRANGER, { limit: 10, offset: 0 }).total).toBe(0);
    });

    it("keeps each owner's profile separate and clears fields with null", () => {
        expect(logbook.getProfile(OWNER).heightCm).toBeNull();
        logbook.updateProfile(OWNER, { birthDate: "1990-05-01", firstName: "Ada", heightCm: 180 });
        expect(logbook.updateProfile(OWNER, { heightCm: null })).toEqual({
            birthDate: "1990-05-01",
            firstName: "Ada",
            heightCm: null,
            lastName: "",
        });
        expect(logbook.getProfile(STRANGER).firstName).toBe("");
    });

    it("rejects finishing an activity before it started", () => {
        startRun();
        expect(() => logbook.finishActivity(OWNER, "2026-08-31T07:00:00+02:00")).toThrow(
            InvalidEntryRangeError,
        );
        const finished = logbook.finishActivity(OWNER, "2026-08-31T09:00:00+02:00");
        expect(finished.endAt).toBe("2026-08-31T07:00:00.000+00:00");
    });

    it("drops the end time when an activity becomes a meal", () => {
        const activity = startRun();
        logbook.finishActivity(OWNER, "2026-08-31T09:00:00+02:00");
        expect(logbook.updateEntry(OWNER, activity.id, { kind: "meal" }).endAt).toBeNull();
    });

    it("cancels the open activity by moving it to trash", () => {
        const activity = startRun();
        logbook.cancelActivity(OWNER);
        expect(logbook.activeActivity(OWNER)).toBeNull();
        expect(logbook.listTrash(OWNER)[0]).toMatchObject({ recordId: activity.id });
    });

    it("soft deletes and restores records without changing their identifiers", () => {
        const entry = logbook.createEntry(OWNER, {
            kind: "meal",
            label: "Lunch",
            startAt: "2026-08-31T12:00:00+02:00",
            text: "Pasta 120 g",
        });
        logbook.softDeleteEntry(OWNER, entry.id);
        expect(logbook.listEntries(OWNER, { limit: 20, offset: 0 }).items).toHaveLength(0);
        expect(logbook.listTrash(OWNER)[0]).toMatchObject({
            label: "Lunch",
            recordId: entry.id,
            recordType: "entry",
        });
        logbook.restore(OWNER, "entry", entry.id);
        expect(logbook.getEntry(OWNER, entry.id).text).toBe("Pasta 120 g");
    });

    it("lists trashed weigh-ins with their weight so the UI can format the unit", () => {
        const weighIn = logbook.createWeighIn(OWNER, 72400, "2026-08-31T07:00:00+02:00");
        logbook.softDeleteWeighIn(OWNER, weighIn.id);
        expect(logbook.listTrash(OWNER)).toEqual([
            expect.objectContaining({ recordType: "weighIn", weightGrams: 72400 }),
        ]);
    });

    it("purges trash older than the retention window only", () => {
        const weighIn = logbook.createWeighIn(OWNER, 72400, "2026-08-31T07:00:00+02:00");
        logbook.softDeleteWeighIn(OWNER, weighIn.id);
        const in29Days = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
        const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
        expect(logbook.purgeExpiredTrash(in29Days)).toBe(0);
        expect(logbook.purgeExpiredTrash(in31Days)).toBe(1);
    });

    it("reports the full recorded range across entries and weigh-ins", () => {
        expect(logbook.recordedRange(OWNER)).toBeNull();
        logbook.createWeighIn(OWNER, 72400, "2026-08-01T07:00:00+00:00");
        startRun();
        logbook.finishActivity(OWNER, "2026-08-31T09:00:00+02:00");
        expect(logbook.recordedRange(OWNER)).toEqual({
            first: "2026-08-01T07:00:00.000+00:00",
            last: "2026-08-31T07:00:00.000+00:00",
        });
    });

    it("lists recent training labels, newest first, and record times for streaks", () => {
        startRun();
        logbook.finishActivity(OWNER, "2026-08-31T09:00:00+02:00");
        logbook.createEntry(OWNER, {
            kind: "training",
            label: "Gym",
            startAt: "2026-09-01T18:00:00+02:00",
            text: "",
        });
        logbook.createWeighIn(OWNER, 72400, "2026-08-30T07:00:00+02:00");
        expect(logbook.recentLabels(OWNER, "training")).toEqual(["Gym", "Run"]);
        expect(logbook.recentLabels(OWNER, "sleep")).toEqual([]);
        expect(logbook.recordTimestamps(OWNER, "2026-08-31T00:00:00+00:00")).toHaveLength(2);
        expect(logbook.recordTimestamps(STRANGER, "2000-01-01T00:00:00+00:00")).toEqual([]);
    });

    it("saves one note per day and owner, and removes it when emptied", () => {
        expect(logbook.saveDayNote(OWNER, "2026-10-09", "Good focus at work.")?.text).toBe(
            "Good focus at work.",
        );
        logbook.saveDayNote(OWNER, "2026-10-09", "Good focus at work. Tired evening.");
        logbook.saveDayNote(OWNER, "2026-10-07", "Rest day.");
        expect(logbook.getDayNote(STRANGER, "2026-10-09")).toBeNull();
        expect(logbook.listDayNotes(OWNER, "2026-10-01", "2026-10-31").map((n) => n.day)).toEqual([
            "2026-10-07",
            "2026-10-09",
        ]);
        expect(logbook.saveDayNote(OWNER, "2026-10-09", "   ")).toBeNull();
        expect(logbook.getDayNote(OWNER, "2026-10-09")).toBeNull();
    });

    it("keeps weigh-ins in canonical grams while preferences remain independent", () => {
        const weighIn = logbook.createWeighIn(OWNER, 72400, "2026-08-31T07:00:00+02:00");
        const settings = logbook.updateSettings(OWNER, { exportLocale: "it", weightUnit: "lb" });
        expect(weighIn.weightGrams).toBe(72400);
        expect(settings).toMatchObject({
            exportLocale: "it",
            locale: "en",
            theme: "system",
            weightUnit: "lb",
        });
    });
});

describe("legacy schema migration", () => {
    it("adds web preferences without changing existing rows", () => {
        const database = new Database(":memory:");
        database.exec(`
      CREATE TABLE user_settings (
        user_id INTEGER PRIMARY KEY,
        locale TEXT NOT NULL CHECK (locale IN ('en', 'it')),
        weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lb'))
      );
      INSERT INTO user_settings (user_id, locale, weight_unit) VALUES (99, 'it', 'kg');
      PRAGMA user_version = 2;
    `);
        migrateDatabase(database);
        const row = database.prepare("SELECT * FROM user_settings WHERE user_id = 99").get();
        expect(row).toMatchObject({
            export_locale: "it",
            locale: "it",
            theme: "system",
            weight_unit: "kg",
        });
        expect(database.pragma("user_version", { simple: true })).toBe(6);
        database.close();
    });
});
