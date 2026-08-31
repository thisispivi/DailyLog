import { NextRequest } from "next/server";
import { z } from "zod";

import { apiFailure, ApiError, ok, requireApiSession } from "@/core/http/api";
import { RecordNotFoundError, repository } from "@/infrastructure/database/logbook-repository";

const finishSchema = z.object({ endAt: z.iso.datetime({ offset: true }) });

export async function GET(request: NextRequest) {
    try {
        const context = await requireApiSession(request);
        return ok(repository().activeActivity(context.userId));
    } catch (error) {
        return apiFailure(error);
    }
}

export async function PATCH(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const { endAt } = finishSchema.parse(await request.json());
        return ok(repository().finishActivity(context.userId, endAt));
    } catch (error) {
        if (error instanceof RecordNotFoundError)
            error = new ApiError(404, "NOT_FOUND", error.message);
        return apiFailure(error, requestId);
    }
}

export async function DELETE(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const active = repository().activeActivity(context.userId);
        if (!active) throw new ApiError(404, "NOT_FOUND", "No activity is active.");
        repository().softDeleteEntry(context.userId, active.id);
        return ok({ deleted: true });
    } catch (error) {
        return apiFailure(error, requestId);
    }
}
