import { getEnvironment } from "@/core/config/env";
import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { localDateRangeBounds } from "@/core/time/zoned-time";
import { dayDeletionSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const DELETE = authenticatedRoute(async (request, { userId }) => {
    const { date } = await readJson(request, dayDeletionSchema);
    const [from, to] = localDateRangeBounds(date, date, getEnvironment().timezone);
    return ok({ deleted: new LogbookRepository().softDeleteEntriesBetween(userId, from, to) });
});
