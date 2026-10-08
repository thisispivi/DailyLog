import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { recordIdSchema, updateEntrySchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

type EntryRouteContext = { params: Promise<{ id: string }> };

export const PATCH = authenticatedRoute<EntryRouteContext>(
    async (request, { userId }, { params }) => {
        const id = recordIdSchema.parse((await params).id);
        const changes = await readJson(request, updateEntrySchema);
        return ok(new LogbookRepository().updateEntry(userId, id, changes));
    },
);

export const DELETE = authenticatedRoute<EntryRouteContext>(
    async (_request, { userId }, { params }) => {
        new LogbookRepository().softDeleteEntry(userId, recordIdSchema.parse((await params).id));
        return ok({ deleted: true });
    },
);
