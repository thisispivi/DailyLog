import { getEnvironment } from "@/core/config/env";
import { ApiError, authenticatedRoute, ok, readJson } from "@/core/http/api";
import { localDateInZone } from "@/core/time/zoned-time";
import { generateWeek, mondayOf } from "@/features/meal-plan/meal-plan";
import { generatePlanSchema } from "@/features/meal-plan/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

/**
 * A new week from this Monday in the configured time zone. The server rolls the
 * dice, so the stored plan is the source of truth.
 */
export const POST = authenticatedRoute(async (request, { userId }) => {
    await readJson(request, generatePlanSchema);
    const logbook = new LogbookRepository();
    const diet = logbook.getDiet(userId);
    if (!diet) throw new ApiError(409, "NO_DIET", "Upload a diet first.");
    const today = localDateInZone(new Date(), getEnvironment().timezone);
    const plan = generateWeek(diet, mondayOf(today), Math.random);
    logbook.saveMealPlan(userId, plan);
    return ok(plan);
});
