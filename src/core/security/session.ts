import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { getEnvironment } from "@/core/config/env";

const COOKIE_NAME = "dailylog_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

/**
 * NODE_ENV alone can't tell us whether this request actually arrived over
 * HTTPS (e.g. a plain HTTP deployment behind no TLS-terminating proxy still
 * runs with NODE_ENV=production). Marking the cookie Secure when the
 * connection isn't HTTPS makes browsers silently refuse to store it, which
 * looks like a login that "accepts the password but stays on the login
 * page." Base the flag on the request's real scheme instead.
 */
function isSecureRequest(request: NextRequest): boolean {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto) return forwardedProto.split(",")[0]?.trim() === "https";
    return request.nextUrl.protocol === "https:";
}

type SessionPayload = Readonly<{
    expiresAt: number;
    nonce: string;
    userId: number;
}>;

function encode(value: string): string {
    return Buffer.from(value).toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
    return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/** Compares a submitted password without exposing early-exit timing differences. */
export function verifyPassword(candidate: string): boolean {
    const expected = getEnvironment().appPassword;
    if (!expected) return false;
    const actualDigest = createHmac("sha256", "dailylog-password").update(candidate).digest();
    const expectedDigest = createHmac("sha256", "dailylog-password").update(expected).digest();
    return timingSafeEqual(actualDigest, expectedDigest);
}

export async function createSession(request: NextRequest): Promise<void> {
    const environment = getEnvironment();
    if (!environment.sessionSecret) throw new Error("Authentication is not configured.");

    const payload: SessionPayload = {
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
        nonce: randomBytes(16).toString("base64url"),
        userId: environment.ownerId,
    };
    const encodedPayload = encode(JSON.stringify(payload));
    const token = `${encodedPayload}.${sign(encodedPayload, environment.sessionSecret)}`;
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        maxAge: SESSION_DURATION_SECONDS,
        path: "/",
        sameSite: "strict",
        secure: isSecureRequest(request),
    });
}

export async function destroySession(request: NextRequest): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "strict",
        secure: isSecureRequest(request),
    });
}

/** Validates signature, expiry, shape, and owner binding for the current session cookie. */
export async function readSession(): Promise<SessionPayload | null> {
    const secret = getEnvironment().sessionSecret;
    if (!secret) return null;
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return null;
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra) return null;
    const expectedSignature = sign(encodedPayload, secret);
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

    try {
        const payload = JSON.parse(
            Buffer.from(encodedPayload, "base64url").toString("utf8"),
        ) as unknown;
        if (!isSessionPayload(payload)) return null;
        if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
        if (payload.userId !== getEnvironment().ownerId) return null;
        return payload;
    } catch {
        return null;
    }
}

function isSessionPayload(value: unknown): value is SessionPayload {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
        Number.isInteger(candidate.expiresAt) &&
        typeof candidate.nonce === "string" &&
        Number.isInteger(candidate.userId)
    );
}
