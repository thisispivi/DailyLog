/** Runs once when the server starts, so bad configuration fails before the first request. */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { getEnvironment } = await import("@/core/config/env");
    getEnvironment();
}
