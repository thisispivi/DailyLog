import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { reportError } from "@/core/observability/error-reporting";
import { log } from "@/core/observability/logger";
import { readSession } from "@/core/security/session";
import {
    DuplicateOpenActivityError,
    InvalidEntryRangeError,
    RecordNotFoundError,
} from "@/features/logbook/domain";

export type AuthenticatedContext = Readonly<{ requestId: string; userId: number }>;

/** An expected failure with a stable code the client can branch on. */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

type RouteHandler<RouteContext> = (
    request: NextRequest,
    routeContext: RouteContext,
) => Promise<Response>;

/** Wraps a route handler with request IDs, same-origin checks, and error mapping. */
export function publicRoute<RouteContext = unknown>(
    handler: (
        request: NextRequest,
        requestId: string,
        routeContext: RouteContext,
    ) => Promise<Response>,
): RouteHandler<RouteContext> {
    return async (request, routeContext) => {
        const requestId = readRequestId(request);
        try {
            verifyRequestOrigin(request);
            return await handler(request, requestId, routeContext);
        } catch (error) {
            return apiFailure(error, requestId);
        }
    };
}

/** Like {@link publicRoute}, but rejects requests without a valid owner session. */
export function authenticatedRoute<RouteContext = unknown>(
    handler: (
        request: NextRequest,
        context: AuthenticatedContext,
        routeContext: RouteContext,
    ) => Promise<Response>,
): RouteHandler<RouteContext> {
    return publicRoute(async (request, requestId, routeContext) => {
        const session = await readSession();
        if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
        return handler(request, { requestId, userId: session.userId }, routeContext);
    });
}

export function ok<T>(data: T, status = 200): NextResponse {
    return NextResponse.json({ data }, { status });
}

/** Parses a JSON body; malformed JSON is a client error, not a server failure. */
export async function readJson<Schema extends z.ZodType>(
    request: NextRequest,
    schema: Schema,
): Promise<z.output<Schema>> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON.");
    }
    return schema.parse(body);
}

export function readQuery<Schema extends z.ZodType>(
    request: NextRequest,
    schema: Schema,
): z.output<Schema> {
    return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

/** Converts known failures to stable client contracts and hides everything else. */
export function apiFailure(error: unknown, requestId: string): NextResponse {
    const known = toApiError(error);
    if (known) {
        return NextResponse.json(
            { error: { code: known.code, message: known.message, requestId } },
            { status: known.status },
        );
    }
    if (error instanceof ZodError) {
        return NextResponse.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    fields: z.flattenError(error).fieldErrors,
                    message: "The submitted data is invalid.",
                    requestId,
                },
            },
            { status: 400 },
        );
    }
    log("error", "api.unhandled", {
        errorType: error instanceof Error ? error.name : "unknown",
        requestId,
    });
    void reportError(error, { requestId });
    return NextResponse.json(
        {
            error: {
                code: "INTERNAL_ERROR",
                message: "The operation could not be completed.",
                requestId,
            },
        },
        { status: 500 },
    );
}

function toApiError(error: unknown): ApiError | null {
    if (error instanceof ApiError) return error;
    if (error instanceof RecordNotFoundError) return new ApiError(404, "NOT_FOUND", error.message);
    if (error instanceof DuplicateOpenActivityError) {
        return new ApiError(409, "ACTIVITY_ALREADY_OPEN", error.message);
    }
    if (error instanceof InvalidEntryRangeError) {
        return new ApiError(400, "INVALID_RANGE", error.message);
    }
    return null;
}

const requestIdPattern = /^[\w-]{1,64}$/;

/** Reuses a proxy-supplied request ID only when it is safe to echo into logs. */
function readRequestId(request: NextRequest): string {
    const supplied = request.headers.get("x-request-id");
    return supplied && requestIdPattern.test(supplied) ? supplied : randomUUID();
}

function firstHeaderValue(request: NextRequest, name: string): string | null {
    return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

/**
 * The standalone Next.js server reports `request.nextUrl.origin` as
 * `http://${HOSTNAME}:${PORT}` (e.g. "http://0.0.0.0:3000") regardless of the
 * Host header the client actually sent, so it can never match a real
 * browser's Origin header. Compare against the forwarded/Host header instead.
 */
function resolveRequestOrigin(request: NextRequest): string {
    const host = firstHeaderValue(request, "x-forwarded-host") ?? request.headers.get("host");
    if (!host) return request.nextUrl.origin;
    const protocol =
        firstHeaderValue(request, "x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    return `${protocol}://${host}`;
}

export function verifyRequestOrigin(request: NextRequest): void {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.get("origin");
    if (!origin || !URL.canParse(origin)) {
        throw new ApiError(403, "INVALID_ORIGIN", "Request origin could not be verified.");
    }
    if (new URL(origin).origin !== resolveRequestOrigin(request)) {
        throw new ApiError(403, "INVALID_ORIGIN", "Cross-origin requests are not allowed.");
    }
}
