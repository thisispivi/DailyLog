import type Database from "better-sqlite3";
import type { Database as SqlJsDatabase, SqlJsStatic, SqlValue } from "sql.js";

import { migrateDatabase } from "@/infrastructure/database/schema";

const STORAGE_KEY = "dailylog-demo-database";

declare global {
    interface Window {
        initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
    }
}

type Parameter = SqlValue | boolean | undefined;

const toSql = (parameters: readonly Parameter[]): SqlValue[] =>
    parameters.map((value) =>
        value === undefined ? null : typeof value === "boolean" ? Number(value) : value,
    );

/**
 * The part of better-sqlite3 the repository and migrations use, on SQLite
 * compiled to WebAssembly (sql.js). Both are synchronous, so the repository
 * code runs unchanged.
 */
class BrowserDatabase {
    private depth = 0;

    constructor(readonly sql: SqlJsDatabase) {}

    prepare(source: string) {
        const rows = (parameters: readonly Parameter[], limit: number) => {
            const statement = this.sql.prepare(source);
            try {
                statement.bind(toSql(parameters));
                const result: Record<string, SqlValue>[] = [];
                while (result.length < limit && statement.step())
                    result.push(statement.getAsObject());
                return result;
            } finally {
                statement.free();
            }
        };
        return {
            all: (...parameters: Parameter[]) => rows(parameters, Infinity),
            get: (...parameters: Parameter[]) => rows(parameters, 1)[0],
            run: (...parameters: Parameter[]) => {
                this.sql.run(source, toSql(parameters));
                const changes = this.sql.getRowsModified();
                const id = this.sql.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
                return { changes, lastInsertRowid: Number(id ?? 0) };
            },
        };
    }

    exec(source: string): this {
        this.sql.exec(source);
        return this;
    }

    pragma(source: string, options?: { simple?: boolean }): unknown {
        const result = this.sql.exec(`PRAGMA ${source}`)[0];
        if (options?.simple) return result?.values[0]?.[0];
        return (result?.values ?? []).map((values) =>
            Object.fromEntries(
                result?.columns.map((column, index) => [column, values[index]]) ?? [],
            ),
        );
    }

    /** Savepoints, like better-sqlite3, so nested transactions work too. */
    transaction<Arguments extends unknown[], Result>(run: (...args: Arguments) => Result) {
        return (...args: Arguments): Result => {
            const name = `demo_${(this.depth += 1)}`;
            this.sql.exec(`SAVEPOINT ${name}`);
            try {
                const result = run(...args);
                this.sql.exec(`RELEASE ${name}`);
                return result;
            } catch (error) {
                this.sql.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
                throw error;
            } finally {
                this.depth -= 1;
            }
        };
    }
}

let database: BrowserDatabase | null = null;

export function getDemoDatabase(): Database.Database {
    if (!database) throw new Error("The demo database is not open yet.");
    return database as unknown as Database.Database;
}

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Could not load ${src}`));
        document.head.append(script);
    });
}

function readSaved(): Uint8Array | null {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? Uint8Array.from(atob(saved), (character) => character.charCodeAt(0)) : null;
    } catch {
        return null;
    }
}

/** Keeps the demo's data across reloads in this browser; storage may be blocked. */
export function saveDemoDatabase(): void {
    if (!database) return;
    const bytes = database.sql.export();
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    try {
        localStorage.setItem(STORAGE_KEY, btoa(binary));
    } catch {
        // Too large or blocked: the demo still works until the tab closes.
    }
}

export function forgetDemoDatabase(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing saved to forget.
    }
}

let opening: Promise<boolean> | null = null;

/** Opens the saved demo database, or a new one; resolves true when it is new and needs seeding. */
export function openDemoDatabase(): Promise<boolean> {
    opening ??= (async () => {
        // sql.js is served as a plain script: its Node branch would not bundle for the browser.
        if (!window.initSqlJs) await loadScript("/sql-wasm.js");
        const initSqlJs = window.initSqlJs;
        if (!initSqlJs) throw new Error("sql.js did not load.");
        const SQL = await initSqlJs({ locateFile: (file) => `/${file}` });
        const saved = readSaved();
        database = new BrowserDatabase(saved ? new SQL.Database(saved) : new SQL.Database());
        migrateDatabase(getDemoDatabase());
        return saved === null;
    })();
    return opening;
}
