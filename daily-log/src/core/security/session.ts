import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getEnvironment } from "@/core/config/env";

const COOKIE_NAME = "dailylog_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
/** A session in use is reissued at most once a day, so it only lapses after a week idle. */
const RENEW_AFTER_SECONDS = 60 * 60 * 24;

const sessionPayloadSchema = z.strictObject({
    expiresAt: z.number().int(),
    nonce: z.string().min(1),
    userId: z.number().int(),
});

type SessionPayload = z.infer<typeof sessionPayloadSchema>;

/**
 * NODE_ENV alone can't tell us whether this request actually arrived over
 * HTTPS (e.g. a plain HTTP deployment behind no TLS-terminating proxy still
 * runs with NODE_ENV=production). Marking the cookie Secure when the
 * connection isn't HTTPS makes browsers silently refuse to store it, which
 * looks like a login that "accepts the password but stays on the login
 * page." Base the flag on the request's real scheme instead.
 */
export function isSecureRequest(request: NextRequest): boolean {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto) return forwardedProto.split(",")[0]?.trim() === "https";
    return request.nextUrl.protocol === "https:";
}

function sign(encodedPayload: string, secret: string): string {
    return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

/** A salted scrypt hash in the form `scrypt:<salt>:<key>`, both base64url. */
export function hashPassword(password: string): string {
    const salt = randomBytes(16);
    return `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, 64).toString("base64url")}`;
}

/**
 * Checks a submitted password against the stored hash once the owner has set
 * one, otherwise against APP_PASSWORD. Both paths compare in constant time.
 */
export function verifyPassword(candidate: string, storedHash: string | null): boolean {
    if (storedHash) {
        const [scheme, salt, key] = storedHash.split(":");
        if (scheme !== "scrypt" || !salt || !key) return false;
        const expectedKey = Buffer.from(key, "base64url");
        const actualKey = scryptSync(candidate, Buffer.from(salt, "base64url"), expectedKey.length);
        return timingSafeEqual(actualKey, expectedKey);
    }
    const expected = getEnvironment().appPassword;
    if (!expected) return false;
    // Hashing both sides first gives timingSafeEqual equal-length inputs.
    const actualDigest = createHmac("sha256", "dailylog-password").update(candidate).digest();
    const expectedDigest = createHmac("sha256", "dailylog-password").update(expected).digest();
    return timingSafeEqual(actualDigest, expectedDigest);
}

function issueSessionToken(userId: number, secret: string): string {
    const payload: SessionPayload = {
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
        nonce: randomBytes(16).toString("base64url"),
        userId,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function sessionCookieOptions(request: NextRequest, maxAge: number) {
    // Lax, not Strict: Chrome drops Strict cookies on the first request when an
    // installed app is launched, which forced a new sign-in on every launch.
    // Mutations are still guarded by the same-origin check in authenticatedRoute.
    return {
        httpOnly: true,
        maxAge,
        path: "/",
        sameSite: "lax",
        secure: isSecureRequest(request),
    } as const;
}

export async function createSession(request: NextRequest): Promise<void> {
    const environment = getEnvironment();
    if (!environment.sessionSecret) throw new Error("Authentication is not configured.");
    (await cookies()).set(
        COOKIE_NAME,
        issueSessionToken(environment.ownerId, environment.sessionSecret),
        sessionCookieOptions(request, SESSION_DURATION_SECONDS),
    );
}

export function needsRenewal(expiresAt: number, nowSeconds: number): boolean {
    return expiresAt - nowSeconds < SESSION_DURATION_SECONDS - RENEW_AFTER_SECONDS;
}

/** The valid session in a request's cookie, for the proxy, which has no cookies() store. */
export function sessionFromRequest(request: NextRequest): SessionPayload | null {
    const { ownerId, sessionSecret } = getEnvironment();
    const token = request.cookies.get(COOKIE_NAME)?.value;
    return sessionSecret && token ? verifySessionToken(token, sessionSecret, ownerId) : null;
}

/** Reissues a valid session cookie that is more than a day old, from the proxy. */
export function renewSession(
    request: NextRequest,
    response: NextResponse,
    session: SessionPayload,
): void {
    const { sessionSecret } = getEnvironment();
    if (!sessionSecret || !needsRenewal(session.expiresAt, Math.floor(Date.now() / 1000))) return;
    response.cookies.set(
        COOKIE_NAME,
        issueSessionToken(session.userId, sessionSecret),
        sessionCookieOptions(request, SESSION_DURATION_SECONDS),
    );
}

export async function destroySession(request: NextRequest): Promise<void> {
    (await cookies()).set(COOKIE_NAME, "", sessionCookieOptions(request, 0));
}

/** Validates signature, expiry, shape, and owner binding for the current session cookie. */
export async function readSession(): Promise<SessionPayload | null> {
    const environment = getEnvironment();
    if (!environment.sessionSecret) return null;
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    return token ? verifySessionToken(token, environment.sessionSecret, environment.ownerId) : null;
}

export function verifySessionToken(
    token: string,
    secret: string,
    ownerId: number,
    nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload | null {
    const [encodedPayload, suppliedSignature, extra] = token.split(".");
    if (!encodedPayload || !suppliedSignature || extra !== undefined) return null;
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(sign(encodedPayload, secret));
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

    let decoded: unknown;
    try {
        decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    } catch {
        return null;
    }
    const payload = sessionPayloadSchema.safeParse(decoded);
    if (!payload.success) return null;
    if (payload.data.expiresAt <= nowSeconds || payload.data.userId !== ownerId) return null;
    return payload.data;
}
