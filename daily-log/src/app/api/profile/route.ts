import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { updateProfileSchema } from "@/features/profile/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const GET = authenticatedRoute(async (_request, { userId }) =>
    ok(new LogbookRepository().getProfile(userId)),
);

export const PATCH = authenticatedRoute(async (request, { userId }) => {
    const changes = await readJson(request, updateProfileSchema);
    return ok(new LogbookRepository().updateProfile(userId, changes));
});
