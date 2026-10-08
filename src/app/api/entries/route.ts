import type { NextRequest } from "next/server";
import { z } from "zod";

import { getEnvironment } from "@/core/config/env";
import { apiFailure, ApiError, ok, requireApiSession } from "@/core/http/api";
import { localDateRangeBounds } from "@/core/time/zoned-time";
import { createEntrySchema, paginationSchema } from "@/features/logbook/schemas";
import {
    DuplicateOpenActivityError,
    repository,
} from "@/infrastructure/database/logbook-repository";

const filterSchema = paginationSchema.extend({
    from: z.iso.date().optional(),
    kind: z.enum(["meal", "training", "sleep"]).optional(),
    query: z.string().trim().max(120).optional(),
    to: z.iso.date().optional(),
});

export async function GET(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const raw = Object.fromEntries(request.nextUrl.searchParams);
        const filters = filterSchema.parse(raw);
        let from: string | undefined;
        let to: string | undefined;
        if (filters.from || filters.to) {
            const first = filters.from ?? "1900-01-01";
            const last = filters.to ?? "2999-12-31";
            if (last < first)
                throw new ApiError(400, "INVALID_RANGE", "End date must follow start date.");
            [from, to] = localDateRangeBounds(first, last, getEnvironment().timezone);
        }
        return ok(
            repository().listEntries(context.userId, {
                ...(from ? { from } : {}),
                ...(filters.kind ? { kind: filters.kind } : {}),
                limit: filters.limit,
                offset: filters.offset,
                ...(filters.query ? { query: filters.query } : {}),
                ...(to ? { to } : {}),
            }),
        );
    } catch (error) {
        return apiFailure(error, requestId);
    }
}

export async function POST(request: NextRequest) {
    let requestId: string | undefined;
    try {
        const context = await requireApiSession(request);
        requestId = context.requestId;
        const input = createEntrySchema.parse(await request.json());
        const entry = repository().createEntry(context.userId, {
            ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
            kind: input.kind,
            label: input.label,
            startAt: input.startAt,
            text: input.text,
        });
        return ok(entry, 201);
    } catch (error) {
        if (error instanceof DuplicateOpenActivityError) {
            error = new ApiError(409, "ACTIVITY_ALREADY_OPEN", error.message);
        }
        return apiFailure(error, requestId);
    }
}
