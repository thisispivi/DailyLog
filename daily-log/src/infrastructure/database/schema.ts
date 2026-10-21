import type Database from "better-sqlite3";

/**
 * Free of Node APIs, so the browser demo can run the same migrations on SQLite
 * compiled to WebAssembly.
 */
export const SCHEMA_VERSION = 11;

/** Applies all additive schema changes in one transaction for app startup and tests. */
export function migrateDatabase(
    db: Pick<Database.Database, "exec" | "pragma" | "transaction">,
): void {
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
        if (!settingsColumns.some((column) => column.name === "time_format")) {
            db.exec(
                "ALTER TABLE user_settings ADD COLUMN time_format TEXT NOT NULL DEFAULT '24h' CHECK (time_format IN ('24h', '12h'))",
            );
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
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY,
        first_name TEXT NOT NULL DEFAULT '' CHECK (length(first_name) <= 60),
        last_name TEXT NOT NULL DEFAULT '' CHECK (length(last_name) <= 60),
        birth_date TEXT CHECK (birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        height_cm INTEGER CHECK (height_cm BETWEEN 100 AND 250)
      );
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id INTEGER PRIMARY KEY,
        password_hash TEXT NOT NULL CHECK (password_hash LIKE 'scrypt:%'),
        updated_at TEXT NOT NULL
      );
    `);
        const profileColumns = db.pragma("table_info(user_profiles)") as Array<{ name: string }>;
        if (!profileColumns.some((column) => column.name === "goal_weight_grams")) {
            db.exec(`
        ALTER TABLE user_profiles ADD COLUMN goal_weight_grams INTEGER
          CHECK (goal_weight_grams BETWEEN 1 AND 1000000);
        ALTER TABLE user_profiles ADD COLUMN goal_date TEXT
          CHECK (goal_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
        ALTER TABLE user_profiles ADD COLUMN goal_set_at TEXT;
      `);
        }
        db.exec(`
      CREATE TABLE IF NOT EXISTS diets (
        user_id INTEGER PRIMARY KEY,
        document TEXT NOT NULL CHECK (json_valid(document)),
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meal_plans (
        user_id INTEGER PRIMARY KEY,
        plan TEXT NOT NULL CHECK (json_valid(plan)),
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_versions (
        user_id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL CHECK (version >= 0)
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    })();
}
