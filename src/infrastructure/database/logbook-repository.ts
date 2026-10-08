import type Database from "better-sqlite3";

import { toStorageTimestamp } from "@/core/time/zoned-time";
import {
    DuplicateOpenActivityError,
    InvalidEntryRangeError,
    RecordNotFoundError,
    TRASH_RETENTION_DAYS,
    type Entry,
    type EntryFilters,
    type EntryKind,
    type Locale,
    type Theme,
    type TrashItem,
    type UserSettings,
    type WeighIn,
    type WeightUnit,
} from "@/features/logbook/domain";
import type { EntryChanges, NewEntry, SettingsChanges } from "@/features/logbook/schemas";
import { getDatabase } from "@/infrastructure/database/client";

// Row shapes are guaranteed by the schema's CHECK constraints, so rows are mapped
// rather than re-validated on every read.
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

type TrashRow = {
    deleted_at: string;
    label: string;
    record_id: number;
    record_type: "entry" | "weighIn";
    weight_grams: number | null;
};

type WhereClause = { parameters: Array<number | string>; sql: string };

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
            .get(userId) as SettingsRow;
        return mapSettings(row);
    }

    updateSettings(userId: number, changes: SettingsChanges): UserSettings {
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
        const result = withActivityConstraint(() =>
            this.database
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
                ),
        );
        return this.getEntry(userId, Number(result.lastInsertRowid));
    }

    getEntry(userId: number, entryId: number): Entry {
        const row = this.database
            .prepare("SELECT * FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL")
            .get(userId, entryId) as EntryRow | undefined;
        if (!row) throw new RecordNotFoundError("Entry not found.");
        return mapEntry(row);
    }

    /** Newest first, paginated. `from`/`to` are UTC storage bounds; overlapping entries match. */
    listEntries(userId: number, filters: EntryFilters): { items: Entry[]; total: number } {
        const where = entryWhere(userId, filters);
        const total = this.database
            .prepare(`SELECT COUNT(*) AS count FROM entries WHERE ${where.sql}`)
            .get(...where.parameters) as { count: number };
        const rows = this.database
            .prepare(
                `SELECT * FROM entries WHERE ${where.sql}
         ORDER BY start_at DESC, id DESC LIMIT ? OFFSET ?`,
            )
            .all(...where.parameters, filters.limit, filters.offset) as EntryRow[];
        return { items: rows.map(mapEntry), total: total.count };
    }

    /** Every entry overlapping the range, oldest first, for reports and day views. */
    listEntriesInRange(userId: number, from: string, to: string): Entry[] {
        const where = entryWhere(userId, { from, to });
        const rows = this.database
            .prepare(`SELECT * FROM entries WHERE ${where.sql} ORDER BY start_at ASC, id ASC`)
            .all(...where.parameters) as EntryRow[];
        return rows.map(mapEntry);
    }

    /** Earliest and latest timestamps across all live records, or null when there are none. */
    recordedRange(userId: number): { first: string; last: string } | null {
        const row = this.database
            .prepare(
                `SELECT MIN(first) AS first, MAX(last) AS last FROM (
           SELECT start_at AS first, COALESCE(end_at, start_at) AS last
             FROM entries WHERE user_id = ? AND deleted_at IS NULL
           UNION ALL
           SELECT recorded_at, recorded_at
             FROM weigh_ins WHERE user_id = ? AND deleted_at IS NULL
         )`,
            )
            .get(userId, userId) as { first: string | null; last: string | null };
        return row.first && row.last ? { first: row.first, last: row.last } : null;
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
        const kind = changes.kind ?? current.kind;
        const startAt = changes.startAt ?? current.startAt;
        // Meals are instants; switching an activity to a meal drops its end.
        const endAt =
            kind === "meal" ? null : changes.endAt !== undefined ? changes.endAt : current.endAt;
        if (endAt && Date.parse(endAt) <= Date.parse(startAt)) {
            throw new InvalidEntryRangeError("End time must follow start time.");
        }
        withActivityConstraint(() =>
            this.database
                .prepare(
                    `UPDATE entries SET kind = ?, label = ?, text = ?, start_at = ?, end_at = ?, updated_at = ?
           WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
                )
                .run(
                    kind,
                    changes.label ?? current.label,
                    changes.text ?? current.text,
                    toStorageTimestamp(startAt),
                    endAt ? toStorageTimestamp(endAt) : null,
                    storageNow(),
                    userId,
                    entryId,
                ),
        );
        return this.getEntry(userId, entryId);
    }

    finishActivity(userId: number, endAt: string): Entry {
        const active = this.activeActivity(userId);
        if (!active) throw new RecordNotFoundError("No activity is active.");
        return this.updateEntry(userId, active.id, { endAt });
    }

    cancelActivity(userId: number): void {
        const active = this.activeActivity(userId);
        if (!active) throw new RecordNotFoundError("No activity is active.");
        this.softDeleteEntry(userId, active.id);
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

    /** Trashes meals inside the range and activities overlapping it; weigh-ins are kept. */
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

    /** Newest first. Pass `limit: null` for every match, e.g. for exports. */
    listWeighIns(
        userId: number,
        { from, limit = 500, to }: { from?: string; limit?: number | null; to?: string } = {},
    ): WeighIn[] {
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
        // SQLite treats a negative LIMIT as "no limit".
        const rows = this.database
            .prepare(
                `SELECT * FROM weigh_ins WHERE ${clauses.join(" AND ")}
         ORDER BY recorded_at DESC, id DESC LIMIT ?`,
            )
            .all(...parameters, limit ?? -1) as WeighInRow[];
        return rows.map(mapWeighIn);
    }

    updateWeighIn(
        userId: number,
        weighInId: number,
        changes: { recordedAt?: string; weightGrams?: number },
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
                `SELECT 'entry' AS record_type, id AS record_id, label, NULL AS weight_grams, deleted_at
         FROM entries WHERE user_id = ? AND deleted_at IS NOT NULL
         UNION ALL
         SELECT 'weighIn' AS record_type, id AS record_id, '' AS label, weight_grams, deleted_at
         FROM weigh_ins WHERE user_id = ? AND deleted_at IS NOT NULL
         ORDER BY deleted_at DESC LIMIT ?`,
            )
            .all(userId, userId, limit) as TrashRow[];
        return rows.map(mapTrashItem);
    }

    restore(userId: number, recordType: TrashItem["recordType"], recordId: number): void {
        const table = recordType === "entry" ? "entries" : "weigh_ins";
        const result = withActivityConstraint(() =>
            this.database
                .prepare(
                    `UPDATE ${table} SET deleted_at = NULL, updated_at = ?
           WHERE user_id = ? AND id = ? AND deleted_at IS NOT NULL`,
                )
                .run(storageNow(), userId, recordId),
        );
        if (result.changes === 0) throw new RecordNotFoundError("Trash item not found.");
    }

    /** Hard-deletes records trashed before the retention window, for every owner. */
    purgeExpiredTrash(now = new Date()): number {
        const cutoff = toStorageTimestamp(
            new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        );
        return this.database.transaction(() => {
            const entries = this.database
                .prepare("DELETE FROM entries WHERE deleted_at < ?")
                .run(cutoff).changes;
            const weighIns = this.database
                .prepare("DELETE FROM weigh_ins WHERE deleted_at < ?")
                .run(cutoff).changes;
            return entries + weighIns;
        })();
    }
}

function entryWhere(userId: number, filters: Omit<EntryFilters, "limit" | "offset">): WhereClause {
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
    return { parameters, sql: clauses.join(" AND ") };
}

function withActivityConstraint<T>(write: () => T): T {
    try {
        return write();
    } catch (error) {
        if (isUniqueConstraint(error)) {
            throw new DuplicateOpenActivityError("An activity is already active.");
        }
        throw error;
    }
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

function mapTrashItem(row: TrashRow): TrashItem {
    const base = { deletedAt: row.deleted_at, recordId: row.record_id };
    return row.record_type === "entry"
        ? { ...base, label: row.label, recordType: "entry" }
        : { ...base, recordType: "weighIn", weightGrams: row.weight_grams ?? 0 };
}

function escapeLike(value: string): string {
    return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isUniqueConstraint(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";
}
