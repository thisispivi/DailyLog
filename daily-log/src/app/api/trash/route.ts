import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { restoreSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const GET = authenticatedRoute(async (_request, { userId }) =>
    ok(new LogbookRepository().listTrash(userId)),
);

export const POST = authenticatedRoute(async (request, { userId }) => {
    const { recordId, recordType } = await readJson(request, restoreSchema);
    new LogbookRepository().restore(userId, recordType, recordId);
    return ok({ restored: true });
});
