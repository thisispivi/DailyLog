import { handleDemoRequest } from "@demo/shell/api";

type JsonMethod = "DELETE" | "PATCH" | "POST" | "PUT";

/** Same contract as the app's sendJson, answered by the route handlers in this tab. */
export async function sendJson(
    path: string,
    method: JsonMethod,
    body?: unknown,
): Promise<{ ok: boolean; status: number }> {
    try {
        const response = await handleDemoRequest(path, method, body);
        return { ok: response.ok, status: response.status };
    } catch (error) {
        console.error(error);
        return { ok: false, status: 0 };
    }
}
