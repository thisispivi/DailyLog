import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { dayParamSchema, saveDayNoteSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

type NoteRouteContext = { params: Promise<{ day: string }> };

export const GET = authenticatedRoute<NoteRouteContext>(async (_request, { userId }, { params }) =>
    ok(new LogbookRepository().getDayNote(userId, dayParamSchema.parse((await params).day))),
);

/** Replaces the day's note; an empty text deletes it. */
export const PUT = authenticatedRoute<NoteRouteContext>(async (request, { userId }, { params }) => {
    const day = dayParamSchema.parse((await params).day);
    const { text } = await readJson(request, saveDayNoteSchema);
    return ok(new LogbookRepository().saveDayNote(userId, day, text));
});
