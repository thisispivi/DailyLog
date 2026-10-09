import { z } from "zod";

import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localizedTitle } from "@/core/preferences/preference-cookies";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { monthGrid, monthPattern } from "@/features/calendar/month";
import { CalendarMonth } from "@/features/calendar/ui/calendar-month";
import { DayTimeline } from "@/features/dashboard/ui/day-timeline";
import { dailyTotals } from "@/features/insights/insights";
import { DayNote } from "@/features/notes/ui/day-note";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./calendar.css";

export const generateMetadata = () => localizedTitle("nav.calendar");

// Bad or missing query values fall back to the current month and day.
const querySchema = z.object({
    day: z.iso.date().optional().catch(undefined),
    month: z.string().regex(monthPattern).optional().catch(undefined),
});

export default async function CalendarPage({
    searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
    const query = querySchema.parse(await searchParams);
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, weightUnit } = logbook.getSettings(ownerId);
    const today = localDateInZone(new Date(), timezone);
    const month = query.month ?? query.day?.slice(0, 7) ?? today.slice(0, 7);
    const selected = query.day?.startsWith(month)
        ? query.day
        : today.startsWith(month)
          ? today
          : `${month}-01`;

    const grid = monthGrid(month);
    const firstDay = grid[0] ?? `${month}-01`;
    const lastDay = grid.at(-1) ?? `${month}-28`;
    const [from, to] = localDateRangeBounds(firstDay, lastDay, timezone);
    const entries = logbook.listEntriesInRange(ownerId, from, to);
    const weighIns = logbook.listWeighIns(ownerId, { from, limit: null, to });

    const [dayStart, dayEnd] = localDateRangeBounds(selected, selected, timezone);
    const dayTitle = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(
        new Date(`${selected}T12:00:00Z`),
    );

    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(locale, "app.tagline")}</p>
                    <h1>{translate(locale, "nav.calendar")}</h1>
                </div>
            </header>
            <div className="calendar-layout">
                <CalendarMonth
                    days={dailyTotals(grid, entries, weighIns, timezone)}
                    locale={locale}
                    month={month}
                    noteDays={logbook
                        .listDayNotes(ownerId, firstDay, lastDay)
                        .map((note) => note.day)}
                    selected={selected}
                    today={today}
                    weightUnit={weightUnit}
                />
                <div className="calendar-detail">
                    <DayTimeline
                        dayEnd={dayEnd}
                        dayStart={dayStart}
                        entries={logbook.listEntriesInRange(ownerId, dayStart, dayEnd)}
                        locale={locale}
                        timeZone={timezone}
                        title={dayTitle}
                        weighIns={logbook.listWeighIns(ownerId, { from: dayStart, to: dayEnd })}
                        weightUnit={weightUnit}
                    />
                    <DayNote
                        day={selected}
                        initialText={logbook.getDayNote(ownerId, selected)?.text ?? ""}
                        key={selected}
                        locale={locale}
                    />
                </div>
            </div>
        </>
    );
}
