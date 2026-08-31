import type Database from "better-sqlite3";

import { getEnvironment } from "@/core/config/env";
import { toStorageTimestamp } from "@/core/time/zoned-time";
import type {
    Entry,
    EntryFilters,
    EntryKind,
    Locale,
    Theme,
    TrashItem,
    UserSettings,
    WeighIn,
    WeightUnit,
} from "@/features/logbook/domain";
import { getDatabase } from "@/infrastructure/database/client";

type EntryRow = {
    created_at: string;
    end_at: string | null;
    id: number;
    kind: EntryKind;
    label: string;
    start_at: string;
    text: string;
    updated_at: string;
    user_id: number;
};

type WeighInRow = {
    created_at: string;
    id: number;
    recorded_at: string;
    updated_at: string;
    user_id: number;
    weight_grams: number;
};

type SettingsRow = {
    export_locale: Locale;
    locale: Locale;
    theme: Theme;
    user_id: number;
    weight_unit: WeightUnit;
};

export type NewEntry = Readonly<{
    endAt?: string | null;
    kind: EntryKind;
    label: string;
    startAt: string;
    text: string;
}>;

export type EntryChanges = Partial<NewEntry>;

export class DuplicateOpenActivityError extends Error {}
export class RecordNotFoundError extends Error {}

/** SQLite repository that scopes every record operation to the authenticated owner. */
export class LogbookRepository {
    constructor(private readonly database: Database.Database = getDatabase()) {}

    getSettings(userId: number): UserSettings {
        this.database
            .prepare(
                `INSERT OR IGNORE INTO user_settings
          (user_id, locale, export_locale, weight_unit, theme)
         VALUES (?, 'en', 'en', 'kg', 'system')`,
            )
            .run(userId);
        const row = this.database
            .prepare("SELECT * FROM user_settings WHERE user_id = ?")
            .get(userId) as SettingsRow | undefined;
        if (!row) throw new Error("Settings could not be initialized.");
        return mapSettings(row);
    }

    updateSettings(
        userId: number,
        changes: Partial<Pick<UserSettings, "exportLocale" | "locale" | "theme" | "weightUnit">>,
    ): UserSettings {
        const current = this.getSettings(userId);
        this.database
            .prepare(
                `UPDATE user_settings
         SET locale = ?, export_locale = ?, weight_unit = ?, theme = ?
         WHERE user_id = ?`,
            )
            .run(
                changes.locale ?? current.locale,
                changes.exportLocale ?? current.exportLocale,
                changes.weightUnit ?? current.weightUnit,
                changes.theme ?? current.theme,
                userId,
            );
        return this.getSettings(userId);
    }

    createEntry(userId: number, input: NewEntry): Entry {
        const now = storageNow();
        try {
            const result = this.database
                .prepare(
                    `INSERT INTO entries
            (user_id, kind, label, text, start_at, end_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .run(
                    userId,
                    input.kind,
                    input.label,
                    input.text,
                    toStorageTimestamp(input.startAt),
                    input.endAt ? toStorageTimestamp(input.endAt) : null,
                    now,
                    now,
                );
            return this.getEntry(userId, Number(result.lastInsertRowid));
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new DuplicateOpenActivityError("An activity is already active.");
            throw error;
        }
    }

    getEntry(userId: number, entryId: number): Entry {
        const row = this.database
            .prepare("SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL")
            .get(userId, entryId) as EntryRow | undefined;
        if (!row) throw new RecordNotFoundError("Entry not found.");
        return mapEntry(row);
    }

    listEntries(userId: number, filters: EntryFilters): { items: Entry[]; total: number } {
        const clauses = ["user_id = ?", "deleted_at IS NULL"];
        const parameters: Array<number | string> = [userId];
        if (filters.kind) {
            clauses.push("kind = ?");
            parameters.push(filters.kind);
        }
        if (filters.query) {
            clauses.push("(label LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')");
            const query = `%${escapeLike(filters.query)}%`;
            parameters.push(query, query);
        }
        if (filters.from) {
            clauses.push("COALESCE(end_at, start_at) > ?");
            parameters.push(filters.from);
        }
        if (filters.to) {
            clauses.push("start_at < ?");
            parameters.push(filters.to);
        }
        const where = clauses.join(" AND ");
        const total = this.database
            .prepare(`SELECT COUNT(*) AS count FROM entries WHERE ${where}`)
            .get(...parameters) as { count: number };
        const rows = this.database
            .prepare(
                `SELECT * FROM entries WHERE ${where}
         ORDER BY start_at DESC, id DESC LIMIT ? OFFSET ?`,
            )
            .all(...parameters, filters.limit, filters.offset) as EntryRow[];
        return { items: rows.map(mapEntry), total: total.count };
    }

    listAllEntries(userId: number, from?: string, to?: string): Entry[] {
        return this.listEntries(userId, {
            ...(from ? { from } : {}),
            limit: 100_000,
            offset: 0,
            ...(to ? { to } : {}),
        }).items.reverse();
    }

    recentEntries(userId: number, limit = 8): Entry[] {
        const rows = this.database
            .prepare(
                `SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC LIMIT ?`,
            )
            .all(userId, limit) as EntryRow[];
        return rows.map(mapEntry);
    }

    activeActivity(userId: number): Entry | null {
        const row = this.database
            .prepare(
                `SELECT * FROM entries
         WHERE user_id = ? AND deleted_at IS NULL AND end_at IS NULL
           AND kind IN ('training', 'sleep')
         ORDER BY start_at ASC, id ASC LIMIT 1`,
            )
            .get(userId) as EntryRow | undefined;
        return row ? mapEntry(row) : null;
    }

    updateEntry(userId: number, entryId: number, changes: EntryChanges): Entry {
        const current = this.getEntry(userId, entryId);
        const candidate = {
            endAt: changes.endAt !== undefined ? changes.endAt : current.endAt,
            kind: changes.kind ?? current.kind,
            label: changes.label ?? current.label,
            startAt: changes.startAt ?? current.startAt,
            text: changes.text ?? current.text,
        };
        const next: NewEntry =
            candidate.kind === "meal" ? { ...candidate, endAt: null } : candidate;
        if (next.endAt && Date.parse(next.endAt) <= Date.parse(next.startAt)) {
            throw new Error("End time must follow start time.");
        }
        try {
            this.database
                .prepare(
                    `UPDATE entries SET kind = ?, label = ?, text = ?, start_at = ?, end_at = ?, updated_at = ?
           WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
                )
                .run(
                    next.kind,
                    next.label,
                    next.text,
                    toStorageTimestamp(next.startAt),
                    next.endAt ? toStorageTimestamp(next.endAt) : null,
                    storageNow(),
                    userId,
                    entryId,
                );
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new DuplicateOpenActivityError("An activity is already active.");
            throw error;
        }
        return this.getEntry(userId, entryId);
    }

    finishActivity(userId: number, endAt: string): Entry {
        const active = this.activeActivity(userId);
        if (!active) throw new RecordNotFoundError("No activity is active.");
        return this.updateEntry(userId, active.id, { endAt });
    }

    softDeleteEntry(userId: number, entryId: number): void {
        const now = storageNow();
        const result = this.database
            .prepare(
                "UPDATE entries SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
            )
            .run(now, now, userId, entryId);
        if (result.changes === 0) throw new RecordNotFoundError("Entry not found.");
    }

    softDeleteEntriesBetween(userId: number, from: string, to: string): number {
        const now = storageNow();
        const result = this.database
            .prepare(
                `UPDATE entries SET deleted_at = ?, updated_at = ?
         WHERE user_id = ? AND deleted_at IS NULL AND start_at < ?
           AND ((kind = 'meal' AND start_at >= ?)
             OR (kind IN ('training', 'sleep') AND (end_at IS NULL OR end_at > ?)))`,
            )
            .run(now, now, userId, to, from, from);
        return result.changes;
    }

    createWeighIn(userId: number, weightGrams: number, recordedAt: string): WeighIn {
        const now = storageNow();
        const result = this.database
            .prepare(
                `INSERT INTO weigh_ins (user_id, weight_grams, recorded_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
            )
            .run(userId, weightGrams, toStorageTimestamp(recordedAt), now, now);
        return this.getWeighIn(userId, Number(result.lastInsertRowid));
    }

    getWeighIn(userId: number, weighInId: number): WeighIn {
        const row = this.database
            .prepare("SELECT * FROM weigh_ins WHERE user_id = ? AND id = ? AND deleted_at IS NULL")
            .get(userId, weighInId) as WeighInRow | undefined;
        if (!row) throw new RecordNotFoundError("Weigh-in not found.");
        return mapWeighIn(row);
    }

    listWeighIns(userId: number, from?: string, to?: string, limit = 500): WeighIn[] {
        const clauses = ["user_id = ?", "deleted_at IS NULL"];
        const parameters: Array<number | string> = [userId];
        if (from) {
            clauses.push("recorded_at >= ?");
            parameters.push(from);
        }
        if (to) {
            clauses.push("recorded_at < ?");
            parameters.push(to);
        }
        const rows = this.database
            .prepare(
                `SELECT * FROM weigh_ins WHERE ${clauses.join(" AND ")}
         ORDER BY recorded_at DESC, id DESC LIMIT ?`,
            )
            .all(...parameters, limit) as WeighInRow[];
        return rows.map(mapWeighIn);
    }

    updateWeighIn(
        userId: number,
        weighInId: number,
        changes: Partial<Pick<WeighIn, "recordedAt" | "weightGrams">>,
    ): WeighIn {
        const current = this.getWeighIn(userId, weighInId);
        this.database
            .prepare(
                `UPDATE weigh_ins SET weight_grams = ?, recorded_at = ?, updated_at = ?
         WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
            )
            .run(
                changes.weightGrams ?? current.weightGrams,
                changes.recordedAt ? toStorageTimestamp(changes.recordedAt) : current.recordedAt,
                storageNow(),
                userId,
                weighInId,
            );
        return this.getWeighIn(userId, weighInId);
    }

    softDeleteWeighIn(userId: number, weighInId: number): void {
        const now = storageNow();
        const result = this.database
            .prepare(
                `UPDATE weigh_ins SET deleted_at = ?, updated_at = ?
         WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
            )
            .run(now, now, userId, weighInId);
        if (result.changes === 0) throw new RecordNotFoundError("Weigh-in not found.");
    }

    listTrash(userId: number, limit = 100): TrashItem[] {
        this.purgeExpiredTrash();
        const rows = this.database
            .prepare(
                `SELECT 'entry' AS record_type, id AS record_id, label, deleted_at
         FROM entries WHERE user_id = ? AND deleted_at IS NOT NULL
         UNION ALL
         SELECT 'weighIn' AS record_type, id AS record_id,
           CAST(weight_grams AS TEXT) || ' g' AS label, deleted_at
         FROM weigh_ins WHERE user_id = ? AND deleted_at IS NOT NULL
         ORDER BY deleted_at DESC LIMIT ?`,
            )
            .all(userId, userId, limit) as Array<{
            deleted_at: string;
            label: string;
            record_id: number;
            record_type: "entry" | "weighIn";
        }>;
        return rows.map((row) => ({
            deletedAt: row.deleted_at,
            label: row.label,
            recordId: row.record_id,
            recordType: row.record_type,
        }));
    }

    restore(userId: number, recordType: "entry" | "weighIn", recordId: number): void {
        const table = recordType === "entry" ? "entries" : "weigh_ins";
        try {
            const result = this.database
                .prepare(
                    `UPDATE ${table} SET deleted_at = NULL, updated_at = ?
           WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL`,
                )
                .run(storageNow(), userId, recordId);
            if (result.changes === 0) throw new RecordNotFoundError("Trash item not found.");
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new DuplicateOpenActivityError("An activity is already active.");
            throw error;
        }
    }

    purgeExpiredTrash(): number {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .replace("Z", "+00:00");
        return this.database.transaction(() => {
            const entries = this.database
                .prepare("DELETE FROM entries WHERE deleted_at < ?")
                .run(cutoff).changes;
            const weights = this.database
                .prepare("DELETE FROM weigh_ins WHERE deleted_at < ?")
                .run(cutoff).changes;
            return entries + weights;
        })();
    }
}

export function repository(): LogbookRepository {
    return new LogbookRepository();
}

function storageNow(): string {
    return toStorageTimestamp(new Date().toISOString());
}

function mapEntry(row: EntryRow): Entry {
    return {
        createdAt: row.created_at,
        endAt: row.end_at,
        id: row.id,
        kind: row.kind,
        label: row.label,
        startAt: row.start_at,
        text: row.text,
        updatedAt: row.updated_at,
        userId: row.user_id,
    };
}

function mapWeighIn(row: WeighInRow): WeighIn {
    return {
        createdAt: row.created_at,
        id: row.id,
        recordedAt: row.recorded_at,
        updatedAt: row.updated_at,
        userId: row.user_id,
        weightGrams: row.weight_grams,
    };
}

function mapSettings(row: SettingsRow): UserSettings {
    return {
        exportLocale: row.export_locale,
        locale: row.locale,
        theme: row.theme,
        userId: row.user_id,
        weightUnit: row.weight_unit,
    };
}

function escapeLike(value: string): string {
    return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isUniqueConstraint(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";
}

export function defaultOwnerId(): number {
    return getEnvironment().ownerId;
}
