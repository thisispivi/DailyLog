import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { log } from "@/core/observability/logger";
import { readSession } from "@/core/security/session";

export type AuthenticatedContext = Readonly<{ requestId: string; userId: number }>;

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

export async function requireApiSession(request: NextRequest): Promise<AuthenticatedContext> {
    verifyRequestOrigin(request);
    const session = await readSession();
    if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
    return {
        requestId: request.headers.get("x-request-id") ?? randomUUID(),
        userId: session.userId,
    };
}

export function ok<T>(data: T, status = 200): NextResponse {
    return NextResponse.json({ data }, { status });
}

/** Converts known application failures to stable client contracts and hides internal errors. */
export function apiFailure(error: unknown, requestId: string = randomUUID()): NextResponse {
    if (error instanceof ApiError) {
        return NextResponse.json(
            { error: { code: error.code, message: error.message, requestId } },
            { status: error.status },
        );
    }
    if (error instanceof ZodError) {
        return NextResponse.json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "The submitted data is invalid.",
                    fields: error.flatten().fieldErrors,
                    requestId,
                },
            },
            { status: 400 },
        );
    }
    log("error", "api.unhandled", {
        requestId,
        errorType: error instanceof Error ? error.name : "unknown",
    });
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

function verifyRequestOrigin(request: NextRequest): void {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.get("origin");
    if (!origin) throw new ApiError(403, "INVALID_ORIGIN", "Request origin could not be verified.");
    if (new URL(origin).origin !== request.nextUrl.origin) {
        throw new ApiError(403, "INVALID_ORIGIN", "Cross-origin requests are not allowed.");
    }
}
