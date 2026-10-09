import { getEnvironment } from "@/core/config/env";
import { ApiError, ok, publicRoute, readJson } from "@/core/http/api";
import { log } from "@/core/observability/logger";
import { clearLoginAttempts, consumeLoginAttempt } from "@/core/security/rate-limit";
import { createSession, verifyPassword } from "@/core/security/session";
import { loginSchema } from "@/features/auth/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const POST = publicRoute(async (request, requestId) => {
    const { appPassword, ownerId } = getEnvironment();
    if (!appPassword) {
        throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Authentication is not configured.");
    }
    // The right-most X-Forwarded-For entry is the one the nearest proxy appended.
    const clientKey = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
    if (!consumeLoginAttempt(clientKey)) {
        throw new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts.");
    }
    const { password } = await readJson(request, loginSchema);
    if (!verifyPassword(password, new LogbookRepository().getPasswordHash(ownerId))) {
        log("warn", "auth.login_rejected", { requestId });
        throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    }
    clearLoginAttempts(clientKey);
    await createSession(request);
    log("info", "auth.login_succeeded", { requestId });
    return ok({ authenticated: true });
});
