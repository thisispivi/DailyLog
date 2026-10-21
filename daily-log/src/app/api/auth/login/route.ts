import { getEnvironment } from "@/core/config/env";
import { ApiError, ok, publicRoute, readJson } from "@/core/http/api";
import { log } from "@/core/observability/logger";
import { clearLoginAttempts, isLoginBlocked, recordLoginFailure } from "@/core/security/rate-limit";
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
    const { password } = await readJson(request, loginSchema);
    // Only failures count, so signing in never uses up the limit. No await until the
    // failure is recorded; see isLoginBlocked.
    if (isLoginBlocked(clientKey)) {
        throw new ApiError(429, "RATE_LIMITED", "Too many sign-in attempts.");
    }
    const repository = new LogbookRepository();
    if (!verifyPassword(password, repository.getPasswordHash(ownerId))) {
        recordLoginFailure(clientKey);
        log("warn", "auth.login_rejected", { requestId });
        throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    }
    clearLoginAttempts(clientKey);
    await createSession(request, repository.getSessionVersion(ownerId));
    log("info", "auth.login_succeeded", { requestId });
    return ok({ authenticated: true });
});
