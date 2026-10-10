import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import { getEnvironment } from "@/core/config/env";
import { log } from "@/core/observability/logger";
import { migrateDatabase, SCHEMA_VERSION } from "@/infrastructure/database/schema";

// Re-exported for tests and scripts that migrate a database they opened themselves.
export { migrateDatabase };

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
