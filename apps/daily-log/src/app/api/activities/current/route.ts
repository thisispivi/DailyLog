import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { finishActivitySchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const GET = authenticatedRoute(async (_request, { userId }) =>
    ok(new LogbookRepository().activeActivity(userId)),
);

export const PATCH = authenticatedRoute(async (request, { userId }) => {
    const { endAt } = await readJson(request, finishActivitySchema);
    return ok(new LogbookRepository().finishActivity(userId, endAt));
});

export const DELETE = authenticatedRoute(async (_request, { userId }) => {
    new LogbookRepository().cancelActivity(userId);
    return ok({ deleted: true });
});
