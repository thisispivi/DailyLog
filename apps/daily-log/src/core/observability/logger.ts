import { getEnvironment, type LogLevel } from "@/core/config/env";

type LogContext = Readonly<Record<string, boolean | number | string | null | undefined>>;

const rank: Readonly<Record<LogLevel, number>> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

/** Emits one structured JSON event. Callers pass primitives only, never request bodies. */
export function log(level: LogLevel, event: string, context: LogContext = {}): void {
    if (rank[level] < rank[configuredLevel()]) return;

    const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...context,
    });
    if (level === "error") console.error(payload);
    else if (level === "warn") console.warn(payload);
    else console.info(payload);
}

function configuredLevel(): LogLevel {
    try {
        return getEnvironment().logLevel;
    } catch {
        // Invalid configuration fails elsewhere; logging must still work while reporting it.
        return "info";
    }
}
