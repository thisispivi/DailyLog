import { type NextRequest, NextResponse } from "next/server";

import { apiFailure, requireApiSession } from "@/core/http/api";
import { updateSettingsSchema } from "@/features/logbook/schemas";
import { repository } from "@/infrastructure/database/logbook-repository";

export async function GET(request: NextRequest) {
    try {
        const context = await requireApiSession(request);
        return NextResponse.json({ data: repository().getSettings(context.userId) });
    } catch (error) {
        return apiFailure(error);
    }
}

export async function PATCH(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const input = updateSettingsSchema.parse(await request.json());
        const settings = repository().updateSettings(context.userId, {
            ...(input.exportLocale !== undefined ? { exportLocale: input.exportLocale } : {}),
            ...(input.locale !== undefined ? { locale: input.locale } : {}),
            ...(input.theme !== undefined ? { theme: input.theme } : {}),
            ...(input.weightUnit !== undefined ? { weightUnit: input.weightUnit } : {}),
        });
        const response = NextResponse.json({ data: settings });
        response.cookies.set("dailylog_locale", settings.locale, {
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
        });
        response.cookies.set("dailylog_theme", settings.theme, {
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
        });
        return response;
    } catch (error) {
        return apiFailure(error, requestId);
    }
}
