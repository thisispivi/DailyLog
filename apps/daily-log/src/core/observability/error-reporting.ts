import { APP_VERSION } from "@/core/config/build-info";
import { getEnvironment } from "@/core/config/env";
import { log } from "@/core/observability/logger";

type ErrorContext = Readonly<Record<string, string>>;

type Frame = {
    colno?: number;
    filename: string;
    function: string;
    in_app: boolean;
    lineno?: number;
};

// ponytail: hand-rolled Sentry envelope instead of @sentry/nextjs; server errors only.
// Switch to the SDK if browser errors, breadcrumbs, or tracing are needed.

/** Parses V8 stack lines into Sentry frames, oldest call first as the protocol expects. */
function stackFrames(stack: string | undefined): Frame[] {
    const frames: Frame[] = [];
    for (const line of stack?.split("\n") ?? []) {
        const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
        if (!match?.[2]) continue;
        frames.push({
            colno: Number(match[4]),
            filename: match[2],
            function: match[1] ?? "?",
            in_app: !match[2].includes("node_modules") && !match[2].startsWith("node:"),
            lineno: Number(match[3]),
        });
    }
    return frames.reverse();
}

/** Builds the envelope request for a Bugsink (Sentry-compatible) DSN. */
export function errorEnvelope(
    dsn: string,
    error: unknown,
    context: ErrorContext,
    environment: string,
    now = new Date(),
): { body: string; headers: Record<string, string>; url: string } {
    const { host, pathname, protocol, username } = new URL(dsn);
    const eventId = crypto.randomUUID().replaceAll("-", "");
    const exception =
        error instanceof Error
            ? {
                  type: error.name,
                  value: error.message,
                  stacktrace: { frames: stackFrames(error.stack) },
              }
            : { type: "NonError", value: String(error) };
    const event = {
        environment,
        event_id: eventId,
        exception: { values: [exception] },
        level: "error",
        platform: "node",
        release: APP_VERSION,
        tags: context,
        timestamp: now.getTime() / 1000,
    };
    return {
        body: [
            JSON.stringify({ dsn, event_id: eventId, sent_at: now.toISOString() }),
            JSON.stringify({ type: "event" }),
            JSON.stringify(event),
        ].join("\n"),
        headers: {
            "content-type": "application/x-sentry-envelope",
            "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${username}, sentry_client=dailylog/${APP_VERSION}`,
        },
        url: `${protocol}//${host}/api${pathname}/envelope/`,
    };
}

/** Sends an unexpected server error to Bugsink when BUGSINK_DSN is set. Never throws. */
export async function reportError(error: unknown, context: ErrorContext = {}): Promise<void> {
    try {
        const { errorReportingDsn, nodeEnv } = getEnvironment();
        if (!errorReportingDsn) return;
        const { body, headers, url } = errorEnvelope(errorReportingDsn, error, context, nodeEnv);
        const response = await fetch(url, {
            body,
            headers,
            method: "POST",
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) log("warn", "error_reporting.rejected", { status: response.status });
    } catch {
        log("warn", "error_reporting.failed");
    }
}
