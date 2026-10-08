type JsonMethod = "DELETE" | "PATCH" | "POST";

/**
 * Sends a same-origin JSON request from the browser. Network failures resolve to
 * status 0 so callers handle every outcome in one place.
 */
export async function sendJson(
    path: string,
    method: JsonMethod,
    body?: unknown,
): Promise<{ ok: boolean; status: number }> {
    try {
        const response = await fetch(path, {
            method,
            ...(body === undefined
                ? {}
                : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
        });
        return { ok: response.ok, status: response.status };
    } catch {
        return { ok: false, status: 0 };
    }
}
