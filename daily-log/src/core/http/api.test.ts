import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, authenticatedRoute, ok, publicRoute, readJson } from "@/core/http/api";
import { createSession } from "@/core/security/session";
import { DuplicateOpenActivityError, RecordNotFoundError } from "@/features/logbook/domain";

const cookieJar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
    cookies: async () => ({
        get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
        set: (name: string, value: string) => cookieJar.set(name, value),
    }),
}));

vi.stubEnv("SESSION_SECRET", "api-test-session-secret-at-least-32-characters");

const ORIGIN = "https://dailylog.example";

function post(body: string, headers: Record<string, string> = { origin: ORIGIN }): NextRequest {
    return new NextRequest(`${ORIGIN}/api/test`, {
        body,
        headers: { host: "dailylog.example", "x-forwarded-proto": "https", ...headers },
        method: "POST",
    });
}

const echo = publicRoute(async (request) =>
    ok(await readJson(request, z.strictObject({ name: z.string() }))),
);

async function errorOf(response: Response) {
    return { status: response.status, ...((await response.json()) as { error: object }).error };
}

describe("publicRoute", () => {
    it("passes validated same-origin JSON to the handler", async () => {
        const response = await echo(post('{"name":"DailyLog"}'), undefined);
        expect(await response.json()).toEqual({ data: { name: "DailyLog" } });
    });

    it("answers malformed JSON with 400 instead of a server error", async () => {
        expect(await errorOf(await echo(post("{"), undefined))).toMatchObject({
            code: "INVALID_JSON",
            status: 400,
        });
    });

    it("reports schema violations per field", async () => {
        expect(await errorOf(await echo(post('{"name":1}'), undefined))).toMatchObject({
            code: "VALIDATION_ERROR",
            fields: { name: expect.any(Array) },
            status: 400,
        });
    });

    it("rejects cross-origin, missing, and opaque origins", async () => {
        for (const origin of ["https://evil.example", "null"]) {
            const response = await echo(post("{}", { origin }), undefined);
            expect(response.status).toBe(403);
        }
        expect((await echo(post("{}", {}), undefined)).status).toBe(403);
    });

    it("maps domain errors to stable codes and hides unexpected ones", async () => {
        const failing = (error: unknown) =>
            publicRoute(async () => {
                throw error;
            })(post("{}"), undefined).then(errorOf);

        expect(await failing(new RecordNotFoundError("gone"))).toMatchObject({ status: 404 });
        expect(await failing(new DuplicateOpenActivityError("busy"))).toMatchObject({
            code: "ACTIVITY_ALREADY_OPEN",
            status: 409,
        });
        expect(await failing(new ApiError(429, "RATE_LIMITED", "slow down"))).toMatchObject({
            status: 429,
        });
        expect(await failing(new Error("SQLITE_BUSY: /data/db.sqlite3"))).toEqual({
            code: "INTERNAL_ERROR",
            message: "The operation could not be completed.",
            requestId: expect.any(String),
            status: 500,
        });
    });
});

describe("authenticatedRoute", () => {
    const whoAmI = authenticatedRoute(async (_request, { userId }) => ok({ userId }));

    beforeEach(() => cookieJar.clear());

    it("rejects requests without a valid session cookie", async () => {
        expect(await errorOf(await whoAmI(post("{}"), undefined))).toMatchObject({
            code: "UNAUTHENTICATED",
            status: 401,
        });
        cookieJar.set("dailylog_session", "forged.signature");
        expect((await whoAmI(post("{}"), undefined)).status).toBe(401);
    });

    it("passes the signed-in owner to the handler", async () => {
        await createSession(post("{}"), 0);
        const response = await whoAmI(post("{}"), undefined);
        expect(await response.json()).toEqual({ data: { userId: 1 } });
    });

    it("checks the origin before the session", async () => {
        await createSession(post("{}"), 0);
        const response = await whoAmI(post("{}", { origin: "https://evil.example" }), undefined);
        expect(response.status).toBe(403);
    });
});
