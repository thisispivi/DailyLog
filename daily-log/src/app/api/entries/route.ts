import { getEnvironment } from "@/core/config/env";
import { ApiError, authenticatedRoute, ok, readJson, readQuery } from "@/core/http/api";
import { localDateRangeBounds } from "@/core/time/zoned-time";
import { createEntrySchema, entryFiltersSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

const EARLIEST_DATE = "1900-01-01";
const LATEST_DATE = "2999-12-31";

export const GET = authenticatedRoute(async (request, { userId }) => {
    const { from, kind, limit, offset, query, to } = readQuery(request, entryFiltersSchema);
    let bounds: { from?: string; to?: string } = {};
    if (from || to) {
        const first = from ?? EARLIEST_DATE;
        const last = to ?? LATEST_DATE;
        if (last < first) {
            throw new ApiError(400, "INVALID_RANGE", "End date must follow start date.");
        }
        const [utcFrom, utcTo] = localDateRangeBounds(first, last, getEnvironment().timezone);
        bounds = { from: utcFrom, to: utcTo };
    }
    return ok(
        new LogbookRepository().listEntries(userId, {
            ...bounds,
            ...(kind ? { kind } : {}),
            ...(query ? { query } : {}),
            limit,
            offset,
        }),
    );
});

export const POST = authenticatedRoute(async (request, { userId }) => {
    const input = await readJson(request, createEntrySchema);
    return ok(new LogbookRepository().createEntry(userId, input), 201);
});
