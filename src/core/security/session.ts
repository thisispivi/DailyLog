import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { getEnvironment } from "@/core/config/env";

const COOKIE_NAME = "dailylog_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

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

export async function createSession(): Promise<void> {
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
        secure: environment.nodeEnv === "production",
    });
}

export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "strict",
        secure: getEnvironment().nodeEnv === "production",
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
