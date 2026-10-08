import { z } from "zod";

const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

const isTimeZone = (value: string) => {
    try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
    } catch {
        return false;
    }
};

const environmentSchema = z.object({
    APP_PASSWORD: z.string().min(12).max(256).optional(),
    SESSION_SECRET: z.string().min(32).max(512).optional(),
    APP_USER_ID: z.coerce.number().int().positive().optional(),
    // Name used by the retired Telegram bot; kept so migrated records stay owned.
    ALLOWED_USER_ID: z.coerce.number().int().positive().optional(),
    DATABASE_PATH: z.string().min(1).default("data/dailylogbot.sqlite3"),
    TIMEZONE: z
        .string()
        .min(1)
        .default("Europe/Berlin")
        .refine(isTimeZone, "Must be an IANA timezone such as Europe/Berlin."),
    // The bot accepted Python-style names such as WARNING; normalize them.
    LOG_LEVEL: z.preprocess(
        (value) =>
            typeof value === "string" ? value.toLowerCase().replace("warning", "warn") : value,
        z.enum(logLevels).default("info"),
    ),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Environment = Readonly<{
    appPassword: string | null;
    databasePath: string;
    logLevel: LogLevel;
    nodeEnv: "development" | "test" | "production";
    ownerId: number;
    sessionSecret: string | null;
    timezone: string;
}>;

let cachedEnvironment: Environment | undefined;

/**
 * Returns validated runtime configuration. Throws on invalid values, naming the
 * offending variables but never their contents. Authentication stays closed when
 * its secrets are absent, so production builds complete without a default password.
 */
export function getEnvironment(): Environment {
    if (cachedEnvironment) return cachedEnvironment;
    cachedEnvironment = parseEnvironment(process.env);
    return cachedEnvironment;
}

export function parseEnvironment(source: Record<string, string | undefined>): Environment {
    const parsed = environmentSchema.safeParse(source);
    if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
        throw new Error(`Invalid environment configuration: ${fields}`);
    }
    const env = parsed.data;
    return Object.freeze({
        appPassword: env.APP_PASSWORD ?? null,
        databasePath: env.DATABASE_PATH,
        logLevel: env.LOG_LEVEL,
        nodeEnv: env.NODE_ENV,
        ownerId: env.APP_USER_ID ?? env.ALLOWED_USER_ID ?? 1,
        sessionSecret: env.SESSION_SECRET ?? env.APP_PASSWORD ?? null,
        timezone: env.TIMEZONE,
    });
}
