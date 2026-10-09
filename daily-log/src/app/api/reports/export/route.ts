import { NextResponse } from "next/server";

import { getEnvironment } from "@/core/config/env";
import { ApiError, authenticatedRoute, readQuery } from "@/core/http/api";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { exportQuerySchema } from "@/features/logbook/schemas";
import { createPdf } from "@/features/reports/pdf-report";
import { createWorkbook } from "@/features/reports/workbook";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

const contentTypes = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export const GET = authenticatedRoute(async (request, { userId }) => {
    const query = readQuery(request, exportQuerySchema);
    const { timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    let startDate = query.from;
    let endDate = query.to;
    if (query.all === "true") {
        const range = logbook.recordedRange(userId);
        if (!range) throw new ApiError(404, "NO_DATA", "There is no data to export.");
        startDate = localDateInZone(new Date(range.first), timezone);
        endDate = localDateInZone(new Date(range.last), timezone);
    }
    if (!startDate || !endDate || endDate < startDate) {
        throw new ApiError(400, "INVALID_RANGE", "Choose a valid date range.");
    }
    const [from, to] = localDateRangeBounds(startDate, endDate, timezone);
    const settings = logbook.getSettings(userId);
    const input = {
        endDate,
        entries: logbook.listEntriesInRange(userId, from, to),
        locale: settings.exportLocale,
        notes: logbook.listDayNotes(userId, startDate, endDate),
        profile: logbook.getProfile(userId),
        startDate,
        timeZone: timezone,
        weighIns: logbook.listWeighIns(userId, { from, limit: null, to }).reverse(),
        weightUnit: settings.weightUnit,
    };
    if (!input.entries.length && !input.weighIns.length && !input.notes.length) {
        throw new ApiError(404, "NO_DATA", "There is no data to export.");
    }
    const file = query.format === "pdf" ? await createPdf(input) : await createWorkbook(input);
    return new NextResponse(new Uint8Array(file), {
        headers: {
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="dailylog_${startDate}_${endDate}.${query.format}"`,
            "Content-Type": contentTypes[query.format],
        },
    });
});
