import { z } from "zod";

import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localizedTitle } from "@/core/preferences/preference-cookies";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { HistoryWorkspace, type HistoryView } from "@/features/history/ui/history-workspace";
import { historyTypes, type HistoryFilters } from "@/features/logbook/domain";
import { loneSnackIds, storedLabelsMatching } from "@/features/logbook/entry-label";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./history.css";

export const generateMetadata = () => localizedTitle("nav.history");

const PAGE_SIZE = 20;

// Bad or missing query values fall back to the unfiltered first page.
const querySchema = z.object({
    from: z.iso.date().optional().catch(undefined),
    page: z.coerce.number().int().min(1).max(100_000).catch(1),
    q: z.string().trim().max(120).optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
    type: z
        .enum([...historyTypes, "trash"])
        .optional()
        .catch(undefined),
});

export default async function HistoryPage({
    searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
    const query = querySchema.parse(await searchParams);
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, timeFormat, weightUnit } = logbook.getSettings(ownerId);

    // Either date alone leaves that side open; dates picked in the wrong order are swapped.
    const days = [query.from, query.to].filter((day) => day !== undefined).sort();
    const [first, last] = [days[0], days.at(-1)];
    const bounds = first && last ? localDateRangeBounds(first, last, timezone) : undefined;
    const filters: HistoryFilters = {
        limit: PAGE_SIZE,
        offset: 0,
        ...(bounds && query.from ? { from: bounds[0] } : {}),
        ...(bounds && query.to ? { to: bounds[1] } : {}),
        ...(query.q ? { labels: storedLabelsMatching(query.q, locale), query: query.q } : {}),
        ...(query.type && query.type !== "trash" ? { type: query.type } : {}),
    };

    const isTrash = query.type === "trash";
    let page = query.page;
    let result = isTrash
        ? { items: [], total: 0 }
        : logbook.listHistory(ownerId, { ...filters, offset: (page - 1) * PAGE_SIZE });
    const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
    if (page > pageCount) {
        // A page past the end (after deleting, or an old link) shows the last one instead.
        page = pageCount;
        result = logbook.listHistory(ownerId, { ...filters, offset: (page - 1) * PAGE_SIZE });
    }

    // Whether a snack keeps its number depends on its whole day, which a page may cut.
    const entries = result.items.flatMap((record) =>
        record.recordType === "entry" ? [record.item] : [],
    );
    const entryDays = entries
        .map((entry) => localDateInZone(new Date(entry.startAt), timezone))
        .sort();
    const [firstDay, lastDay] = [entryDays[0], entryDays.at(-1)];
    const loneSnacks =
        firstDay && lastDay
            ? [
                  ...loneSnackIds(
                      logbook.listEntriesInRange(
                          ownerId,
                          ...localDateRangeBounds(firstDay, lastDay, timezone),
                      ),
                      timezone,
                  ),
              ]
            : [];

    const view: HistoryView = {
        page,
        ...(query.from ? { from: query.from } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.type ? { type: query.type } : {}),
    };

    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(locale, "app.tagline")}</p>
                    <h1>{translate(locale, "history.title")}</h1>
                </div>
            </header>
            <HistoryWorkspace
                locale={locale}
                loneSnacks={loneSnacks}
                pageCount={pageCount}
                records={result.items}
                timeFormat={timeFormat}
                timeZone={timezone}
                total={result.total}
                trash={isTrash ? logbook.listTrash(ownerId) : []}
                view={view}
                weightUnit={weightUnit}
            />
        </>
    );
}
