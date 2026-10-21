import { type NextRequest, NextResponse } from "next/server";

import { renewSession, sessionFromRequest } from "@/core/security/session";

/**
 * Pages need a session before anything renders. The (app) layout checks too, but a
 * client navigation can render a page segment without its layout. API routes are
 * left to their wrappers so failures keep the JSON error envelope.
 */
function isPublicPath(pathname: string): boolean {
    return (
        pathname === "/login" ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/_next/") ||
        /\.\w+$/.test(pathname)
    );
}

/** Sends signed-out page requests to sign-in and keeps an active session alive. */
export function proxy(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;
    const session = sessionFromRequest(request);
    if (!session && !isPublicPath(pathname)) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    const response = NextResponse.next();
    // Logout clears the cookie itself; a renewal on the same response would race it.
    if (session && pathname !== "/api/auth/logout") renewSession(request, response, session);
    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
