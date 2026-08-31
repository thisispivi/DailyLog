import { z } from "zod";

const environmentSchema = z.object({
    APP_PASSWORD: z.string().min(12).max(256).optional(),
    SESSION_SECRET: z.string().min(32).max(512).optional(),
    APP_USER_ID: z.coerce.number().int().positive().optional(),
    ALLOWED_USER_ID: z.coerce.number().int().positive().optional(),
    DATABASE_PATH: z.string().min(1).default("data/dailylogbot.sqlite3"),
    TIMEZONE: z.string().min(1).default("Europe/Berlin"),
    LOG_LEVEL: z.preprocess(
        (value) =>
            typeof value === "string" ? value.toLowerCase().replace("warning", "warn") : value,
        z.enum(["debug", "info", "warn", "error"]).default("info"),
    ),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Environment = Readonly<{
    appPassword: string | null;
    databasePath: string;
    logLevel: "debug" | "info" | "warn" | "error";
    nodeEnv: "development" | "test" | "production";
    ownerId: number;
    sessionSecret: string | null;
    timezone: string;
}>;

let cachedEnvironment: Environment | undefined;

/**
 * Returns validated runtime configuration without exposing secret values.
 * Authentication remains closed when its required secrets are absent; this lets
 * production builds complete without silently enabling a development credential.
 */
export function getEnvironment(): Environment {
    if (cachedEnvironment) return cachedEnvironment;

    const parsed = environmentSchema.safeParse(process.env);
    if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
        throw new Error(`Invalid environment configuration: ${fields}`);
    }

    try {
        new Intl.DateTimeFormat("en", { timeZone: parsed.data.TIMEZONE }).format();
    } catch {
        throw new Error("TIMEZONE must be a valid IANA timezone.");
    }

    cachedEnvironment = Object.freeze({
        appPassword: parsed.data.APP_PASSWORD ?? null,
        databasePath: parsed.data.DATABASE_PATH,
        logLevel: parsed.data.LOG_LEVEL,
        nodeEnv: parsed.data.NODE_ENV,
        ownerId: parsed.data.APP_USER_ID ?? parsed.data.ALLOWED_USER_ID ?? 1,
        sessionSecret: parsed.data.SESSION_SECRET ?? parsed.data.APP_PASSWORD ?? null,
        timezone: parsed.data.TIMEZONE,
    });
    return cachedEnvironment;
}

export function resetEnvironmentForTests(): void {
    cachedEnvironment = undefined;
}
