// The demo has one owner and no secrets: any password signs in, and signing
// out is remembered in this browser so the sign-in page can be tried too.
const SIGNED_OUT_KEY = "dailylog-demo-signed-out";
const OWNER = { expiresAt: Number.MAX_SAFE_INTEGER, nonce: "demo", userId: 1 };

function setSignedOut(value: boolean): void {
    try {
        if (value) localStorage.setItem(SIGNED_OUT_KEY, "1");
        else localStorage.removeItem(SIGNED_OUT_KEY);
    } catch {
        // Storage can be blocked; the demo then simply stays signed in.
    }
}

export async function readSession(): Promise<typeof OWNER | null> {
    try {
        return localStorage.getItem(SIGNED_OUT_KEY) ? null : OWNER;
    } catch {
        return OWNER;
    }
}

export async function createSession(): Promise<void> {
    setSignedOut(false);
}

export async function destroySession(): Promise<void> {
    setSignedOut(true);
}

export function verifyPassword(): boolean {
    return true;
}

export function hashPassword(): string {
    return "scrypt:demo:demo";
}

export function isSecureRequest(): boolean {
    return false;
}

/** The static export has no proxy; this only satisfies its import. */
export function sessionFromRequest(): typeof OWNER {
    return OWNER;
}

/** Demo sessions never expire, so there is nothing to renew. */
export function renewSession(): void {}
