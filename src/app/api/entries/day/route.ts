import type { NextRequest } from "next/server";
import { z } from "zod";

import { getEnvironment } from "@/core/config/env";
import { apiFailure, ok, requireApiSession } from "@/core/http/api";
import { localDateRangeBounds } from "@/core/time/zoned-time";
import { repository } from "@/infrastructure/database/logbook-repository";

const inputSchema = z.object({ date: z.iso.date() });

export async function DELETE(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const { date } = inputSchema.parse(await request.json());
        const [from, to] = localDateRangeBounds(date, date, getEnvironment().timezone);
        return ok({ deleted: repository().softDeleteEntriesBetween(context.userId, from, to) });
    } catch (error) {
        return apiFailure(error, requestId);
    }
}
