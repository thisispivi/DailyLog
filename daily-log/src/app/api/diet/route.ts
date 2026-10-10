import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { dietSchema } from "@/features/meal-plan/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

/** Replaces the diet; the meal plan built from the old one is cleared. */
export const PUT = authenticatedRoute(async (request, { userId }) => {
    const diet = await readJson(request, dietSchema);
    new LogbookRepository().saveDiet(userId, diet);
    return ok(diet);
});
