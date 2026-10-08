import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isSecureRequest } from "@/core/security/session";
import { locales, themes, type Locale, type Theme } from "@/features/logbook/domain";

// Mirrors of the saved settings so pages without a session (sign-in, 404) and the
// root layout can render in the right language and theme without a database read.
const LOCALE_COOKIE = "dailylog_locale";
const THEME_COOKIE = "dailylog_theme";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const localeCookieSchema = z.enum(locales).catch("en");
const themeCookieSchema = z.enum(themes).catch("system");

export async function readPreferenceCookies(): Promise<{ locale: Locale; theme: Theme }> {
    const store = await cookies();
    return {
        locale: localeCookieSchema.parse(store.get(LOCALE_COOKIE)?.value),
        theme: themeCookieSchema.parse(store.get(THEME_COOKIE)?.value),
    };
}

export function writePreferenceCookies(
    response: NextResponse,
    request: NextRequest,
    preferences: { locale: Locale; theme: Theme },
): void {
    const options = {
        maxAge: ONE_YEAR_SECONDS,
        path: "/",
        sameSite: "strict",
        secure: isSecureRequest(request),
    } as const;
    response.cookies.set(LOCALE_COOKIE, preferences.locale, options);
    response.cookies.set(THEME_COOKIE, preferences.theme, options);
}
