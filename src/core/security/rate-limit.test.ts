import { beforeEach, describe, expect, it } from "vitest";

import {
    clearLoginAttempts,
    consumeLoginAttempt,
    resetLoginAttemptsForTests,
} from "@/core/security/rate-limit";

const NOW = 1_000_000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function attempt(times: number, clientKey: (index: number) => string): boolean[] {
    return Array.from({ length: times }, (_, index) => consumeLoginAttempt(clientKey(index), NOW));
}

describe("login rate limit", () => {
    beforeEach(resetLoginAttemptsForTests);

    it("blocks a client after eight attempts until the window ends", () => {
        expect(attempt(8, () => "203.0.113.5").every(Boolean)).toBe(true);
        expect(consumeLoginAttempt("203.0.113.5", NOW)).toBe(false);
        expect(consumeLoginAttempt("203.0.113.5", NOW + FIFTEEN_MINUTES)).toBe(true);
    });

    it("caps total attempts even when every request claims a new address", () => {
        const results = attempt(61, (index) => `198.51.100.${index}`);
        expect(results.slice(0, 60).every(Boolean)).toBe(true);
        expect(results[60]).toBe(false);
    });

    it("resets a client after a successful sign-in", () => {
        attempt(8, () => "203.0.113.5");
        clearLoginAttempts("203.0.113.5");
        expect(consumeLoginAttempt("203.0.113.5", NOW)).toBe(true);
    });
});
