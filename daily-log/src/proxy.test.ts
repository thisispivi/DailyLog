import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

vi.stubEnv("SESSION_SECRET", "proxy-test-session-secret-at-least-32-chars");

const signedOut = (path: string) => proxy(new NextRequest(`https://dailylog.example${path}`));

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
});
