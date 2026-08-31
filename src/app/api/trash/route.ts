import { NextRequest } from "next/server";
import { z } from "zod";

import { apiFailure, ApiError, ok, requireApiSession } from "@/core/http/api";
import {
    DuplicateOpenActivityError,
    RecordNotFoundError,
    repository,
} from "@/infrastructure/database/logbook-repository";

const restoreSchema = z.object({
    recordId: z.number().int().positive(),
    recordType: z.enum(["entry", "weighIn"]),
});

export async function GET(request: NextRequest) {
    try {
        const context = await requireApiSession(request);
        return ok(repository().listTrash(context.userId));
    } catch (error) {
        return apiFailure(error);
    }
}

export async function POST(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const input = restoreSchema.parse(await request.json());
        repository().restore(context.userId, input.recordType, input.recordId);
        return ok({ restored: true });
    } catch (error) {
        if (error instanceof RecordNotFoundError)
            error = new ApiError(404, "NOT_FOUND", error.message);
        if (error instanceof DuplicateOpenActivityError) {
            error = new ApiError(409, "ACTIVITY_ALREADY_OPEN", error.message);
        }
        return apiFailure(error, requestId);
    }
}
