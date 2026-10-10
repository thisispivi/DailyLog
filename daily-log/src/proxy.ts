import { type NextRequest, NextResponse } from "next/server";

import { renewSession } from "@/core/security/session";

/** Keeps an active session alive: page loads and API calls both slide its expiry. */
export function proxy(request: NextRequest): NextResponse {
    const response = NextResponse.next();
    // Logout clears the cookie itself; a renewal on the same response would race it.
    if (request.nextUrl.pathname !== "/api/auth/logout") renewSession(request, response);
    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
