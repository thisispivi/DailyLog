import type { Environment } from "@/core/config/env";

/** The demo's single owner, in the visitor's own time zone. */
const environment: Environment = {
    appPassword: "demo",
    databasePath: ":browser:",
    errorReportingDsn: null,
    logLevel: "error",
    nodeEnv: "production",
    ownerId: 1,
    sessionSecret: "demo",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function getEnvironment(): Environment {
    return environment;
}
