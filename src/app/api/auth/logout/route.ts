import { NextRequest } from "next/server";

import { apiFailure, ok, requireApiSession } from "@/core/http/api";
import { destroySession } from "@/core/security/session";

export async function POST(request: NextRequest) {
    try {
        const context = await requireApiSession(request);
        await destroySession();
        return ok({ authenticated: false, requestId: context.requestId });
    } catch (error) {
        return apiFailure(error);
    }
}
