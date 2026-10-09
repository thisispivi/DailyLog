import { NextResponse } from "next/server";

import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { writePreferenceCookies } from "@/core/preferences/preference-cookies";
import { updateSettingsSchema } from "@/features/logbook/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const GET = authenticatedRoute(async (_request, { userId }) =>
    ok(new LogbookRepository().getSettings(userId)),
);

export const PATCH = authenticatedRoute(async (request, { userId }) => {
    const changes = await readJson(request, updateSettingsSchema);
    const settings = new LogbookRepository().updateSettings(userId, changes);
    const response = NextResponse.json({ data: settings });
    writePreferenceCookies(response, request, settings);
    return response;
});
