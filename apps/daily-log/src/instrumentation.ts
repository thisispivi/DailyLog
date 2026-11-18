/** Runs once when the server starts, so bad configuration fails before the first request. */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { getEnvironment } = await import("@/core/config/env");
    const { appPassword, sessionSecret } = getEnvironment();
    if (appPassword && sessionSecret === appPassword) {
        // Changing the password in Settings does not change this key, so anyone who
        // knew the original APP_PASSWORD could keep signing valid session cookies.
        const { log } = await import("@/core/observability/logger");
        log("warn", "config.session_secret_is_password");
    }
}

/** Server rendering and route errors that escape the API wrappers. */
export async function onRequestError(
    error: unknown,
    request: Readonly<{ method: string; path: string }>,
): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { reportError } = await import("@/core/observability/error-reporting");
    // The path only: query strings can carry dates and filters from the journal.
    await reportError(error, { method: request.method, path: request.path.split("?")[0] ?? "" });
}
