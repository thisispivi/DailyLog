import { ApiError, authenticatedRoute, ok, readJson } from "@/core/http/api";
import { rerollMeal } from "@/features/meal-plan/meal-plan";
import { rerollSchema } from "@/features/meal-plan/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

/** Rolls one meal of the stored plan again. */
export const POST = authenticatedRoute(async (request, { userId }) => {
    const { day, meal } = await readJson(request, rerollSchema);
    const logbook = new LogbookRepository();
    const diet = logbook.getDiet(userId);
    const plan = logbook.getMealPlan(userId);
    if (!diet || !plan) throw new ApiError(409, "NO_PLAN", "Generate a meal plan first.");
    const next = rerollMeal(diet, plan, day, meal, Math.random);
    logbook.saveMealPlan(userId, next);
    return ok(next);
});
