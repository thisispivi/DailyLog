import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiFailure, ApiError, ok, requireApiSession } from "@/core/http/api";
import { updateEntrySchema } from "@/features/logbook/schemas";
import {
    DuplicateOpenActivityError,
    RecordNotFoundError,
    repository,
} from "@/infrastructure/database/logbook-repository";

const identifierSchema = z.coerce.number().int().positive();

type EntryRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: EntryRouteContext) {
    let requestId: string | undefined;
    try {
        const auth = await requireApiSession(request);
        requestId = auth.requestId;
        const { id } = await context.params;
        const input = updateEntrySchema.parse(await request.json());
        const entry = repository().updateEntry(auth.userId, identifierSchema.parse(id), {
            ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
            ...(input.kind !== undefined ? { kind: input.kind } : {}),
            ...(input.label !== undefined ? { label: input.label } : {}),
            ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
            ...(input.text !== undefined ? { text: input.text } : {}),
        });
        return ok(entry);
    } catch (error) {
        return entryFailure(error, requestId);
    }
}

export async function DELETE(request: NextRequest, context: EntryRouteContext) {
    let requestId: string | undefined;
    try {
        const auth = await requireApiSession(request);
        requestId = auth.requestId;
        const { id } = await context.params;
        repository().softDeleteEntry(auth.userId, identifierSchema.parse(id));
        return ok({ deleted: true });
    } catch (error) {
        return entryFailure(error, requestId);
    }
}

function entryFailure(error: unknown, requestId?: string) {
    if (error instanceof RecordNotFoundError) error = new ApiError(404, "NOT_FOUND", error.message);
    if (error instanceof DuplicateOpenActivityError) {
        error = new ApiError(409, "ACTIVITY_ALREADY_OPEN", error.message);
    }
    return apiFailure(error, requestId);
}
