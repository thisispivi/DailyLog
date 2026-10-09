import { authenticatedRoute, ok } from "@/core/http/api";
import { destroySession } from "@/core/security/session";

export const POST = authenticatedRoute(async (request) => {
    await destroySession(request);
    return ok({ authenticated: false });
});
