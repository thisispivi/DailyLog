import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { dayParamSchema, updateDayLogSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

type DayRouteContext = { params: Promise<{ day: string }> };

/** Changes what is logged about the day as a whole; null clears a value. */
export const PATCH = authenticatedRoute<DayRouteContext>(
    async (request, { userId }, { params }) => {
        const day = dayParamSchema.parse((await params).day);
        const changes = await readJson(request, updateDayLogSchema);
        return ok(new LogbookRepository().saveDayLog(userId, day, changes));
    },
);
