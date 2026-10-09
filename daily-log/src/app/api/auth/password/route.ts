import { ApiError, authenticatedRoute, ok, readJson } from "@/core/http/api";
import { log } from "@/core/observability/logger";
import { clearLoginAttempts, consumeLoginAttempt } from "@/core/security/rate-limit";
import { hashPassword, verifyPassword } from "@/core/security/session";
import { changePasswordSchema } from "@/features/auth/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const PUT = authenticatedRoute(async (request, { requestId, userId }) => {
    const attemptKey = `password-change:${userId}`;
    const { currentPassword, newPassword } = await readJson(request, changePasswordSchema);
    // A stolen session must not be able to guess the current password freely.
    if (!consumeLoginAttempt(attemptKey)) {
        throw new ApiError(429, "RATE_LIMITED", "Too many attempts.");
    }
    const repository = new LogbookRepository();
    if (!verifyPassword(currentPassword, repository.getPasswordHash(userId))) {
        log("warn", "auth.password_change_rejected", { requestId });
        // 400, not 401: the session is fine, only the submitted password is wrong.
        throw new ApiError(400, "INVALID_CREDENTIALS", "The current password did not match.");
    }
    clearLoginAttempts(attemptKey);
    repository.setPasswordHash(userId, hashPassword(newPassword));
    log("info", "auth.password_changed", { requestId });
    return ok({ changed: true });
});
