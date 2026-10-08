import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiFailure, ApiError, ok, requireApiSession } from "@/core/http/api";
import { updateWeighInSchema, weightToGrams } from "@/features/logbook/schemas";
import { RecordNotFoundError, repository } from "@/infrastructure/database/logbook-repository";

const identifierSchema = z.coerce.number().int().positive();

type WeighInRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: WeighInRouteContext) {
    let requestId: string | undefined;
    try {
        const auth = await requireApiSession(request);
        requestId = auth.requestId;
        const { id } = await context.params;
        const input = updateWeighInSchema.parse(await request.json());
        const changes = {
            ...(input.recordedAt ? { recordedAt: input.recordedAt } : {}),
            ...(input.weight !== undefined && input.unit
                ? { weightGrams: weightToGrams(input.weight, input.unit) }
                : {}),
        };
        return ok(repository().updateWeighIn(auth.userId, identifierSchema.parse(id), changes));
    } catch (error) {
        return weightFailure(error, requestId);
    }
}

export async function DELETE(request: NextRequest, context: WeighInRouteContext) {
    let requestId: string | undefined;
    try {
        const auth = await requireApiSession(request);
        requestId = auth.requestId;
        const { id } = await context.params;
        repository().softDeleteWeighIn(auth.userId, identifierSchema.parse(id));
        return ok({ deleted: true });
    } catch (error) {
        return weightFailure(error, requestId);
    }
}

function weightFailure(error: unknown, requestId?: string) {
    if (error instanceof RecordNotFoundError) error = new ApiError(404, "NOT_FOUND", error.message);
    return apiFailure(error, requestId);
}
