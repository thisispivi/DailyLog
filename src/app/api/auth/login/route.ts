import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getEnvironment } from "@/core/config/env";
import { apiFailure, ApiError } from "@/core/http/api";
import { log } from "@/core/observability/logger";
import { clearLoginAttempts, consumeLoginAttempt } from "@/core/security/rate-limit";
import { createSession, verifyPassword } from "@/core/security/session";

const loginSchema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
        const origin = request.headers.get("origin");
        if (!origin || new URL(origin).origin !== request.nextUrl.origin) {
            throw new ApiError(403, "INVALID_ORIGIN", "Cross-origin requests are not allowed.");
        }
        if (!getEnvironment().appPassword) {
            throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Authentication is not configured.");
        }
        const identifier = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        if (!consumeLoginAttempt(identifier)) {
            throw new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts.");
        }
        const input = loginSchema.parse(await request.json());
        if (!verifyPassword(input.password)) {
            log("warn", "auth.login_rejected", { requestId });
            throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
        }
        clearLoginAttempts(identifier);
        await createSession();
        log("info", "auth.login_succeeded", { requestId });
        return NextResponse.json({ data: { authenticated: true } });
    } catch (error) {
        return apiFailure(error, requestId);
    }
}
