import { beforeEach, describe, expect, it } from "vitest";

import {
    clearLoginAttempts,
    isLoginBlocked,
    recordLoginFailure,
    resetLoginAttemptsForTests,
} from "@/core/security/rate-limit";

const NOW = 1_000_000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function fail(times: number, clientKey: (index: number) => string): void {
    for (let index = 0; index < times; index += 1) recordLoginFailure(clientKey(index), NOW);
}

describe("login rate limit", () => {
    beforeEach(resetLoginAttemptsForTests);

    it("blocks a client after eight failures until the window ends", () => {
        fail(7, () => "203.0.113.5");
        expect(isLoginBlocked("203.0.113.5", NOW)).toBe(false);
        fail(1, () => "203.0.113.5");
        expect(isLoginBlocked("203.0.113.5", NOW)).toBe(true);
        expect(isLoginBlocked("203.0.113.5", NOW + FIFTEEN_MINUTES)).toBe(false);
    });

    it("caps total failures even when every request claims a new address", () => {
        fail(59, (index) => `198.51.100.${index}`);
        expect(isLoginBlocked("192.0.2.1", NOW)).toBe(false);
        fail(1, () => "198.51.100.200");
        expect(isLoginBlocked("192.0.2.1", NOW)).toBe(true);
    });

    it("resets a client after a successful sign-in", () => {
        fail(8, () => "203.0.113.5");
        clearLoginAttempts("203.0.113.5");
        expect(isLoginBlocked("203.0.113.5", NOW)).toBe(false);
    });
});
