import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/infrastructure/database/client";
import {
    DuplicateOpenActivityError,
    LogbookRepository,
} from "@/infrastructure/database/logbook-repository";

describe("LogbookRepository", () => {
    let database: Database.Database;
    let logbook: LogbookRepository;

    beforeEach(() => {
        database = new Database(":memory:");
        migrateDatabase(database);
        logbook = new LogbookRepository(database);
    });

    afterEach(() => database.close());

    it("preserves owner boundaries and enforces one open activity", () => {
        const activity = logbook.createEntry(42, {
            kind: "training",
            label: "Run",
            startAt: "2026-08-31T08:00:00+02:00",
            text: "",
        });
        expect(logbook.activeActivity(42)?.id).toBe(activity.id);
        expect(logbook.activeActivity(7)).toBeNull();
        expect(() =>
            logbook.createEntry(42, {
                kind: "sleep",
                label: "Sleep",
                startAt: "2026-08-31T22:00:00+02:00",
                text: "",
            }),
        ).toThrow(DuplicateOpenActivityError);
    });

    it("soft deletes and restores records without changing their identifiers", () => {
        const entry = logbook.createEntry(42, {
            kind: "meal",
            label: "Lunch",
            startAt: "2026-08-31T12:00:00+02:00",
            text: "Pasta 120 g",
        });
        logbook.softDeleteEntry(42, entry.id);
        expect(logbook.listEntries(42, { limit: 20, offset: 0 }).items).toHaveLength(0);
        expect(logbook.listTrash(42)[0]).toMatchObject({ recordId: entry.id, recordType: "entry" });
        logbook.restore(42, "entry", entry.id);
        expect(logbook.getEntry(42, entry.id).text).toBe("Pasta 120 g");
    });

    it("keeps weigh-ins in canonical grams while preferences remain independent", () => {
        const weighIn = logbook.createWeighIn(42, 72400, "2026-08-31T07:00:00+02:00");
        const settings = logbook.updateSettings(42, {
            exportLocale: "it",
            locale: "en",
            theme: "dark",
            weightUnit: "lb",
        });
        expect(weighIn.weightGrams).toBe(72400);
        expect(settings).toMatchObject({
            exportLocale: "it",
            locale: "en",
            theme: "dark",
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
        const row = database
            .prepare("SELECT * FROM user_settings WHERE user_id = 99")
            .get() as Record<string, unknown>;
        expect(row).toMatchObject({
            export_locale: "it",
            locale: "it",
            theme: "system",
            weight_unit: "kg",
        });
        expect(database.pragma("user_version", { simple: true })).toBe(4);
        database.close();
    });
});
