import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError, ok, publicRoute, readJson } from "@/core/http/api";
import { DuplicateOpenActivityError, RecordNotFoundError } from "@/features/logbook/domain";

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
