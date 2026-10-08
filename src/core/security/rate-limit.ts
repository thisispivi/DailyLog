type Attempt = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_CLIENT = 8;
// The client key comes from X-Forwarded-For, which a direct client can forge.
// A shared ceiling keeps brute force bounded even when every request claims a new IP.
const MAX_ATTEMPTS_TOTAL = 60;
const GLOBAL_KEY = "*";
const PRUNE_THRESHOLD = 1_000;

const attempts = new Map<string, Attempt>();

/**
 * Records one sign-in attempt and returns false when the client or the whole
 * instance is over its limit. ponytail: in-memory, single instance only; a
 * multi-instance deployment needs a shared store.
 */
export function consumeLoginAttempt(clientKey: string, now = Date.now()): boolean {
    if (attempts.size > PRUNE_THRESHOLD) pruneExpired(now);
    const clientAllowed = consume(clientKey, MAX_ATTEMPTS_PER_CLIENT, now);
    const globalAllowed = consume(GLOBAL_KEY, MAX_ATTEMPTS_TOTAL, now);
    return clientAllowed && globalAllowed;
}

export function clearLoginAttempts(clientKey: string): void {
    attempts.delete(clientKey);
}

export function resetLoginAttemptsForTests(): void {
    attempts.clear();
}

function consume(key: string, limit: number, now: number): boolean {
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
}

function pruneExpired(now: number): void {
    for (const [key, attempt] of attempts) {
        if (attempt.resetAt <= now) attempts.delete(key);
    }
}
