// A change counter the demo shell watches: each saved change re-renders the
// page from the database, as router.refresh() does in the real app.
let version = 0;
const listeners = new Set<() => void>();

export function subscribeToDemo(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function demoVersion(): number {
    return version;
}

export function notifyDemoChanged(): void {
    version += 1;
    for (const listener of listeners) listener();
}
