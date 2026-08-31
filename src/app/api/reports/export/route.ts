import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getEnvironment } from "@/core/config/env";
import { apiFailure, ApiError, requireApiSession } from "@/core/http/api";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { createPdf, createWorkbook } from "@/features/reports/report-service";
import { repository } from "@/infrastructure/database/logbook-repository";

const querySchema = z.object({
    all: z.enum(["true", "false"]).default("false"),
    format: z.enum(["xlsx", "pdf"]),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
});

export async function GET(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
        const environment = getEnvironment();
        const logbook = repository();
        const settings = logbook.getSettings(context.userId);
        let startDate = query.from;
        let endDate = query.to;
        if (query.all === "true") {
            const entries = logbook.listAllEntries(context.userId);
            const weighIns = logbook.listWeighIns(context.userId, undefined, undefined, 100_000);
            const timestamps = [
                ...entries.flatMap(
                    (entry) => [entry.startAt, entry.endAt].filter(Boolean) as string[],
                ),
                ...weighIns.map((item) => item.recordedAt),
            ];
            if (!timestamps.length)
                throw new ApiError(404, "NO_DATA", "There is no data to export.");
            timestamps.sort((left, right) => Date.parse(left) - Date.parse(right));
            startDate = localDateInZone(new Date(timestamps[0]!), environment.timezone);
            endDate = localDateInZone(new Date(timestamps.at(-1)!), environment.timezone);
        }
        if (!startDate || !endDate || endDate < startDate) {
            throw new ApiError(400, "INVALID_RANGE", "Choose a valid date range.");
        }
        const [from, to] = localDateRangeBounds(startDate, endDate, environment.timezone);
        const input = {
            endDate,
            entries: logbook.listAllEntries(context.userId, from, to),
            locale: settings.exportLocale,
            startDate,
            timeZone: environment.timezone,
            weighIns: logbook.listWeighIns(context.userId, from, to, 100_000).reverse(),
            weightUnit: settings.weightUnit,
        };
        if (!input.entries.length && !input.weighIns.length)
            throw new ApiError(404, "NO_DATA", "There is no data to export.");
        const file = query.format === "pdf" ? await createPdf(input) : await createWorkbook(input);
        return new NextResponse(new Uint8Array(file), {
            headers: {
                "Cache-Control": "no-store",
                "Content-Disposition": `attachment; filename="dailylog_${startDate}_${endDate}.${query.format}"`,
                "Content-Type":
                    query.format === "pdf"
                        ? "application/pdf"
                        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        return apiFailure(error, requestId);
    }
}
