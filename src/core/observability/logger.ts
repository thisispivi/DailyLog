type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Readonly<Record<string, boolean | number | string | null | undefined>>;

const rank: Readonly<Record<LogLevel, number>> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

/** Emits one structured JSON event while excluding caller-supplied secret objects. */
export function log(level: LogLevel, event: string, context: LogContext = {}): void {
    const configured = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ?? "info";
    if (rank[level] < (rank[configured] ?? rank.info)) return;

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
