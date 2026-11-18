import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { weightToGrams } from "@/features/logbook/domain";
import { createWeighInSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const GET = authenticatedRoute(async (_request, { userId }) =>
    ok(new LogbookRepository().listWeighIns(userId)),
);

export const POST = authenticatedRoute(async (request, { userId }) => {
    const { recordedAt, unit, weight } = await readJson(request, createWeighInSchema);
    return ok(
        new LogbookRepository().createWeighIn(userId, weightToGrams(weight, unit), recordedAt),
        201,
    );
});
