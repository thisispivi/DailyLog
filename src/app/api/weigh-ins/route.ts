import { NextRequest } from "next/server";

import { apiFailure, ok, requireApiSession } from "@/core/http/api";
import { createWeighInSchema, weightToGrams } from "@/features/logbook/schemas";
import { repository } from "@/infrastructure/database/logbook-repository";

export async function GET(request: NextRequest) {
    try {
        const context = await requireApiSession(request);
        return ok(repository().listWeighIns(context.userId));
    } catch (error) {
        return apiFailure(error);
    }
}

export async function POST(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const input = createWeighInSchema.parse(await request.json());
        return ok(
            repository().createWeighIn(
                context.userId,
                weightToGrams(input.weight, input.unit),
                input.recordedAt,
            ),
            201,
        );
    } catch (error) {
        return apiFailure(error, requestId);
    }
}
