import { authenticatedRoute, ok } from "@/core/http/api";
import { destroySession } from "@/core/security/session";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

/** Signs out every device, so a copied session cookie stops working too. */
export const POST = authenticatedRoute(async (request, { userId }) => {
    new LogbookRepository().revokeSessions(userId);
    await destroySession(request);
    return ok({ authenticated: false });
});
