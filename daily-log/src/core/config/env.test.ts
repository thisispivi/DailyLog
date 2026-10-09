import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/core/config/env";

describe("parseEnvironment", () => {
    it("applies defaults and keeps authentication closed without secrets", () => {
        expect(parseEnvironment({})).toMatchObject({
            appPassword: null,
            databasePath: "data/dailylogbot.sqlite3",
            logLevel: "info",
            ownerId: 1,
            sessionSecret: null,
            timezone: "Europe/Berlin",
        });
    });

    it("falls back to the password as session secret and to the bot owner alias", () => {
        const env = parseEnvironment({
            ALLOWED_USER_ID: "123456789",
            APP_PASSWORD: "correct horse battery",
        });
        expect(env).toMatchObject({ ownerId: 123456789, sessionSecret: "correct horse battery" });
    });

    it("accepts the bot's uppercase log levels", () => {
        expect(parseEnvironment({ LOG_LEVEL: "WARNING" }).logLevel).toBe("warn");
    });

    it("names invalid variables without echoing their values", () => {
        const attempt = () => parseEnvironment({ APP_PASSWORD: "short", TIMEZONE: "Mars/Base" });
        expect(attempt).toThrow("APP_PASSWORD, TIMEZONE");
        expect(attempt).not.toThrow(/short/);
    });

    it("accepts a Bugsink DSN and rejects one without a key or project", () => {
        const dsn = "https://abc123@bugsink.example.com/4";
        expect(parseEnvironment({ BUGSINK_DSN: dsn }).errorReportingDsn).toBe(dsn);
        expect(() => parseEnvironment({ BUGSINK_DSN: "https://bugsink.example.com/4" })).toThrow(
            "BUGSINK_DSN",
        );
    });
});
