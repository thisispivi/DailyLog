import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import { getEnvironment } from "@/core/config/env";
import { log } from "@/core/observability/logger";

const SCHEMA_VERSION = 5;
let database: Database.Database | undefined;

/** Opens the shared SQLite connection and applies additive, legacy-compatible migrations. */
export function getDatabase(): Database.Database {
    if (database) return database;
    const path = resolve(getEnvironment().databasePath);
    mkdirSync(dirname(path), { recursive: true });
    backupBeforeMigration(path);
    database = new Database(path);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    migrateDatabase(database);
    return database;
}

function backupBeforeMigration(path: string): void {
    if (!existsSync(path)) return;
    const probe = new Database(path, { readonly: true });
    const version = probe.pragma("user_version", { simple: true }) as number;
    probe.close();
    if (version >= SCHEMA_VERSION) return;
    const backupPath = `${path}.pre-web-v${version}.bak`;
    if (!existsSync(backupPath)) {
        copyFileSync(path, backupPath);
        log("info", "database.backup_created", { backupPath, version });
    }
}

/** Applies all additive schema changes in one transaction for app startup and tests. */
export function migrateDatabase(db: Database.Database): void {
    db.transaction(() => {
        db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('meal', 'training', 'sleep')),
        label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
        text TEXT NOT NULL DEFAULT '' CHECK (length(text) <= 2000),
        start_at TEXT NOT NULL,
        end_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        CHECK (end_at IS NULL OR end_at > start_at),
        CHECK (kind != 'meal' OR end_at IS NULL)
      );
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        locale TEXT NOT NULL CHECK (locale IN ('en', 'it')),
        weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lb'))
      );
      CREATE TABLE IF NOT EXISTS weigh_ins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        weight_grams INTEGER NOT NULL CHECK (weight_grams > 0 AND weight_grams <= 1000000),
        recorded_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
        const settingsColumns = db.pragma("table_info(user_settings)") as Array<{ name: string }>;
        if (!settingsColumns.some((column) => column.name === "export_locale")) {
            db.exec(
                "ALTER TABLE user_settings ADD COLUMN export_locale TEXT NOT NULL DEFAULT 'en'",
            );
            db.exec("UPDATE user_settings SET export_locale = locale");
        }
        if (!settingsColumns.some((column) => column.name === "theme")) {
            db.exec("ALTER TABLE user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'");
        }
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(user_id, start_at);
      CREATE INDEX IF NOT EXISTS idx_entries_user_kind_end ON entries(user_id, kind, end_at);
      CREATE INDEX IF NOT EXISTS idx_entries_user_deleted ON entries(user_id, deleted_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_one_open_activity
        ON entries(user_id)
        WHERE deleted_at IS NULL AND end_at IS NULL AND kind IN ('training', 'sleep');
      CREATE INDEX IF NOT EXISTS idx_weigh_ins_user_recorded ON weigh_ins(user_id, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_weigh_ins_user_deleted ON weigh_ins(user_id, deleted_at);
      CREATE TABLE IF NOT EXISTS day_notes (
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 10000),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, day)
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    })();
}
