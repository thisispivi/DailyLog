import * as currentActivity from "@/app/api/activities/current/route";
import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as password from "@/app/api/auth/password/route";
import * as backup from "@/app/api/backup/route";
import * as diet from "@/app/api/diet/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as entriesDay from "@/app/api/entries/day/route";
import * as entries from "@/app/api/entries/route";
import * as mealPlanReroll from "@/app/api/meal-plan/reroll/route";
import * as mealPlan from "@/app/api/meal-plan/route";
import * as note from "@/app/api/notes/[day]/route";
import * as profile from "@/app/api/profile/route";
import * as settings from "@/app/api/settings/route";
import * as trash from "@/app/api/trash/route";
import * as weighIn from "@/app/api/weigh-ins/[id]/route";
import * as weighIns from "@/app/api/weigh-ins/route";

import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import { saveDemoDatabase } from "@demo/shell/database";
import { localizeDemo } from "@demo/shell/seed";
import { notifyDemoChanged } from "@demo/shell/store";
import { NextRequest } from "@demo/shims/next-server";

type Handler = (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

// Every real route handler except the PDF and spreadsheet exports, which need Node.
const routes: ReadonlyArray<readonly [string, object]> = [
    ["/api/activities/current", currentActivity],
    ["/api/auth/login", login],
    ["/api/auth/logout", logout],
    ["/api/auth/password", password],
    ["/api/backup", backup],
    ["/api/diet", diet],
    ["/api/entries/day", entriesDay],
    ["/api/entries/:id", entry],
    ["/api/entries", entries],
    ["/api/meal-plan/reroll", mealPlanReroll],
    ["/api/meal-plan", mealPlan],
    ["/api/notes/:day", note],
    ["/api/profile", profile],
    ["/api/settings", settings],
    ["/api/trash", trash],
    ["/api/weigh-ins/:id", weighIn],
    ["/api/weigh-ins", weighIns],
];

function match(pattern: string, pathname: string): Record<string, string> | null {
    const expected = pattern.split("/");
    const actual = pathname.split("/");
    if (expected.length !== actual.length) return null;
    const params: Record<string, string> = {};
    for (const [index, part] of expected.entries()) {
        const value = actual[index] ?? "";
        if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(value);
        else if (part !== value) return null;
    }
    return params;
}

/** Answers an /api request with the app's own route handler, against the database in this tab. */
export async function handleDemoRequest(
    path: string,
    method: string,
    body?: unknown,
): Promise<Response> {
    const url = new URL(path, window.location.origin);
    for (const [pattern, module] of routes) {
        const params = match(pattern, url.pathname);
        if (!params) continue;
        const handler = (module as Record<string, Handler | undefined>)[method];
        if (!handler) return new Response(null, { status: 405 });
        const logbook = new LogbookRepository();
        const before = logbook.getSettings(1).locale;
        const response = await handler(new NextRequest(url, method, body), {
            params: Promise.resolve(params),
        });
        if (method !== "GET") {
            // The sample records follow the language, as if the person wrote them in it.
            localizeDemo(before, logbook.getSettings(1).locale);
            saveDemoDatabase();
            notifyDemoChanged();
        }
        return response;
    }
    return new Response(null, { status: 501 });
}
