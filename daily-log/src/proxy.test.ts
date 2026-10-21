import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE } from "@/core/security/session";
import { proxy } from "@/proxy";

const SECRET = "proxy-test-session-secret-at-least-32-chars";
const CURRENT_VERSION = 2;

vi.stubEnv("SESSION_SECRET", SECRET);
vi.mock("@/infrastructure/database/logbook-repository", () => ({
    LogbookRepository: class {
        getSessionVersion = () => CURRENT_VERSION;
    },
}));

const signedOut = (path: string) => proxy(new NextRequest(`https://dailylog.example${path}`));

function signedIn(path: string, version: number) {
    const payload = {
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        nonce: "n",
        userId: 1,
        version,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(encoded).digest("base64url");
    return proxy(
        new NextRequest(`https://dailylog.example${path}`, {
            headers: { cookie: `${SESSION_COOKIE}=${encoded}.${signature}` },
        }),
    );
}

describe("proxy", () => {
    it("sends signed-out page requests to sign-in, even with a file extension", () => {
        for (const path of ["/today", "/today.x", "/entries/1.json"]) {
            expect(signedOut(path).headers.get("location")).toBe("https://dailylog.example/login");
        }
    });

    it("lets sign-in, API routes, and Next assets through", () => {
        for (const path of ["/login", "/api/entries", "/_next/static/chunks/app.js"]) {
            expect(signedOut(path).headers.get("location")).toBeNull();
        }
    });

    it("gives each request its own script nonce, on the request and the response", () => {
        const response = signedOut("/login");
        const policy = response.headers.get("content-security-policy") ?? "";
        expect(policy).toMatch(/script-src 'self' 'nonce-[\w+/=]+' 'strict-dynamic'/);
        expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
        expect(signedOut("/login").headers.get("content-security-policy")).not.toBe(policy);
    });

    it("keeps and renews a session issued under the current version", () => {
        const response = signedIn("/today", CURRENT_VERSION);
        expect(response.headers.get("location")).toBeNull();
        expect(response.cookies.get(SESSION_COOKIE)?.value).toMatch(/^[\w-]+\.[\w-]+$/);
    });

    it("signs out a session issued before the last sign-out or password change", () => {
        const page = signedIn("/today", CURRENT_VERSION - 1);
        expect(page.headers.get("location")).toBe("https://dailylog.example/login");
        expect(page.cookies.get(SESSION_COOKIE)?.value).toBe("");

        const api = signedIn("/api/entries", CURRENT_VERSION - 1);
        expect(api.headers.get("x-middleware-request-cookie")).not.toContain(SESSION_COOKIE);
        expect(api.cookies.get(SESSION_COOKIE)?.value).toBe("");
    });
});
