type Failures = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 8;
// The client key comes from X-Forwarded-For, which a direct client can forge.
// A shared ceiling keeps brute force bounded even when every request claims a new IP.
const MAX_FAILURES_TOTAL = 60;
const GLOBAL_KEY = "*";
const PRUNE_THRESHOLD = 1_000;

const failures = new Map<string, Failures>();

/**
 * True when the client or the whole instance has used up its failed sign-ins.
 * Check, verify the password, and record a failure with no await in between, so
 * parallel requests can't all pass the check first. ponytail: in-memory, single
 * instance only; a multi-instance deployment needs a shared store.
 */
export function isLoginBlocked(clientKey: string, now = Date.now()): boolean {
    return (
        isOverLimit(clientKey, MAX_FAILURES_PER_CLIENT, now) ||
        isOverLimit(GLOBAL_KEY, MAX_FAILURES_TOTAL, now)
    );
}

export function recordLoginFailure(clientKey: string, now = Date.now()): void {
    if (failures.size > PRUNE_THRESHOLD) pruneExpired(now);
    increment(clientKey, now);
    increment(GLOBAL_KEY, now);
}

export function clearLoginAttempts(clientKey: string): void {
    failures.delete(clientKey);
}

export function resetLoginAttemptsForTests(): void {
    failures.clear();
}

function isOverLimit(key: string, limit: number, now: number): boolean {
    const current = failures.get(key);
    return current !== undefined && current.resetAt > now && current.count >= limit;
}

function increment(key: string, now: number): void {
    const current = failures.get(key);
    if (!current || current.resetAt <= now) {
        failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
        current.count += 1;
    }
}

function pruneExpired(now: number): void {
    for (const [key, entry] of failures) {
        if (entry.resetAt <= now) failures.delete(key);
    }
}
