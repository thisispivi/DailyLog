import { describe, expect, it } from "vitest";

import { errorEnvelope } from "@/core/observability/error-reporting";

describe("errorEnvelope", () => {
    it("posts an event with the error and its frames to the DSN's project", () => {
        const error = new TypeError("boom");
        error.stack = [
            "TypeError: boom",
            "    at load (/app/.next/server/page.js:10:5)",
            "    at node:internal/process:1:1",
        ].join("\n");
        const { body, headers, url } = errorEnvelope(
            "https://key42@bugsink.example.com/7",
            error,
            { requestId: "r1" },
            "production",
            new Date("2026-10-09T10:00:00Z"),
        );
        expect(url).toBe("https://bugsink.example.com/api/7/envelope/");
        expect(headers["x-sentry-auth"]).toContain("sentry_key=key42");
        const [, item, event] = body.split("\n").map((line) => JSON.parse(line) as unknown);
        expect(item).toEqual({ type: "event" });
        expect(event).toMatchObject({
            environment: "production",
            exception: {
                values: [
                    {
                        stacktrace: {
                            frames: [
                                { filename: "node:internal/process", in_app: false },
                                {
                                    filename: "/app/.next/server/page.js",
                                    function: "load",
                                    lineno: 10,
                                },
                            ],
                        },
                        type: "TypeError",
                        value: "boom",
                    },
                ],
            },
            tags: { requestId: "r1" },
            timestamp: 1_791_540_000,
        });
    });
});
