type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

/** Small single-instance login limiter; a distributed store can replace it behind this boundary. */
export function consumeLoginAttempt(identifier: string, now = Date.now()): boolean {
    const current = attempts.get(identifier);
    if (!current || current.resetAt <= now) {
        attempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    if (current.count >= MAX_ATTEMPTS) return false;
    current.count += 1;
    return true;
}

export function clearLoginAttempts(identifier: string): void {
    attempts.delete(identifier);
}
