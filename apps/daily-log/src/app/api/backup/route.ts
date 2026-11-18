import { NextResponse } from "next/server";

import { getEnvironment } from "@/core/config/env";
import { authenticatedRoute, ok, readJson } from "@/core/http/api";
import { localDateInZone, toStorageTimestamp } from "@/core/time/zoned-time";
import { backupSchema } from "@/features/backup/schemas";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

export const GET = authenticatedRoute(async (_request, { userId }) => {
    const now = new Date();
    const backup = new LogbookRepository().exportBackup(
        userId,
        toStorageTimestamp(now.toISOString()),
    );
    const day = localDateInZone(now, getEnvironment().timezone);
    return new NextResponse(JSON.stringify(backup, null, 2), {
        headers: {
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="dailylog_backup_${day}.json"`,
            "Content-Type": "application/json; charset=utf-8",
        },
    });
});

export const POST = authenticatedRoute(async (request, { userId }) => {
    const backup = await readJson(request, backupSchema);
    return ok(new LogbookRepository().importBackup(userId, backup));
});
