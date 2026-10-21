import { type NextRequest, NextResponse } from "next/server";

import {
    expireSession,
    renewSession,
    SESSION_COOKIE,
    sessionFromRequest,
} from "@/core/security/session";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

/**
 * Pages need a session before anything renders. The (app) layout checks too, but a
 * client navigation can render a page segment without its layout. API routes are
 * left to their wrappers so failures keep the JSON error envelope. The only public
 * static files, the icons, are excluded by the matcher, so no path is public just
 * because it ends in a file extension.
 */
function isPublicPath(pathname: string): boolean {
    return pathname === "/login" || pathname.startsWith("/api/") || pathname.startsWith("/_next/");
}

/**
 * Sends signed-out page requests to sign-in and keeps an active session alive. A
 * session issued before the owner last signed out or changed the password is
 * removed from the request, so routes and pages see a signed-out request.
 */
export function proxy(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;
    const signedSession = sessionFromRequest(request);
    const isRevoked =
        signedSession !== null &&
        signedSession.version !== new LogbookRepository().getSessionVersion(signedSession.userId);
    if (isRevoked) request.cookies.delete(SESSION_COOKIE);
    const session = isRevoked ? null : signedSession;
    const response =
        !session && !isPublicPath(pathname)
            ? NextResponse.redirect(new URL("/login", request.url))
            : NextResponse.next(isRevoked ? { request: { headers: request.headers } } : undefined);
    if (isRevoked) {
        expireSession(request, response);
    } else if (session && !pathname.startsWith("/api/auth/")) {
        // Sign-in, sign-out, and password changes set the cookie themselves; a
        // renewal on the same response would race them.
        renewSession(request, response, session);
    }
    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
