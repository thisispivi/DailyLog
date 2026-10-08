import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { weightToGrams } from "@/features/logbook/domain";
import { recordIdSchema, updateWeighInSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

type WeighInRouteContext = { params: Promise<{ id: string }> };

export const PATCH = authenticatedRoute<WeighInRouteContext>(
    async (request, { userId }, { params }) => {
        const id = recordIdSchema.parse((await params).id);
        const { recordedAt, unit, weight } = await readJson(request, updateWeighInSchema);
        return ok(
            new LogbookRepository().updateWeighIn(userId, id, {
                ...(recordedAt ? { recordedAt } : {}),
                ...(weight !== undefined && unit
                    ? { weightGrams: weightToGrams(weight, unit) }
                    : {}),
            }),
        );
    },
);

export const DELETE = authenticatedRoute<WeighInRouteContext>(
    async (_request, { userId }, { params }) => {
        new LogbookRepository().softDeleteWeighIn(userId, recordIdSchema.parse((await params).id));
        return ok({ deleted: true });
    },
);
