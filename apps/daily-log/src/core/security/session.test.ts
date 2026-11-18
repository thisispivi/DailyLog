import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
    hashPassword,
    needsRenewal,
    verifyPassword,
    verifySessionToken,
} from "@/core/security/session";

const SECRET = "a-session-secret-that-is-at-least-32-chars";
const OWNER = 42;
const NOW = 1_800_000_000;

function token(payload: unknown, secret = SECRET): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
}

const valid = { expiresAt: NOW + 60, nonce: "abc", userId: OWNER, version: 3 };

describe("verifySessionToken", () => {
    it("accepts a signed, unexpired token for the configured owner", () => {
        expect(verifySessionToken(token(valid), SECRET, OWNER, NOW)).toEqual(valid);
    });

    it("rejects a token signed with another secret", () => {
        expect(verifySessionToken(token(valid, `${SECRET}x`), SECRET, OWNER, NOW)).toBeNull();
    });

    it("rejects expired tokens and tokens for another owner", () => {
        expect(verifySessionToken(token(valid), SECRET, OWNER, NOW + 60)).toBeNull();
        expect(verifySessionToken(token(valid), SECRET, 7, NOW)).toBeNull();
    });

    it("rejects signed payloads with the wrong shape", () => {
        const malformed = token({ expiresAt: "never", nonce: "abc", userId: OWNER });
        expect(verifySessionToken(malformed, SECRET, OWNER, NOW)).toBeNull();
    });

    it("rejects tokens issued before sessions carried a version", () => {
        const unversioned = { expiresAt: NOW + 60, nonce: "abc", userId: OWNER };
        expect(verifySessionToken(token(unversioned), SECRET, OWNER, NOW)).toBeNull();
    });

    it("rejects tokens with extra segments", () => {
        expect(verifySessionToken(`${token(valid)}.extra`, SECRET, OWNER, NOW)).toBeNull();
    });
});

describe("verifyPassword", () => {
    it("checks against a stored hash once one is set", () => {
        const stored = hashPassword("a-brand-new-password");
        expect(verifyPassword("a-brand-new-password", stored)).toBe(true);
        expect(verifyPassword("a-wrong-password", stored)).toBe(false);
        expect(verifyPassword("a-brand-new-password", "scrypt:broken")).toBe(false);
    });
});

describe("needsRenewal", () => {
    const WEEK = 60 * 60 * 24 * 7;
    const DAY = 60 * 60 * 24;

    it("renews a session only once it is more than a day old", () => {
        expect(needsRenewal(NOW + WEEK, NOW)).toBe(false);
        expect(needsRenewal(NOW + WEEK - DAY + 1, NOW)).toBe(false);
        expect(needsRenewal(NOW + WEEK - DAY - 1, NOW)).toBe(true);
    });
});
