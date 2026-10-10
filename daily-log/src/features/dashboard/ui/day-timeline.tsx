import { CalendarHeart } from "lucide-react";

import { formatDuration, formatTime, formatWeight, translate } from "@/core/i18n/translate";
import { clipToDay } from "@/features/insights/insights";
import type { Entry, Locale, TimeFormat, WeighIn, WeightUnit } from "@/features/logbook/domain";
import { entryDisplayLabel, loneSnackIds } from "@/features/logbook/entry-label";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";

import "./day-timeline.css";

type TimelineRow = Readonly<{
    at: string;
    detail: string;
    id: string;
    kind: RecordKind;
    title: string;
}>;

/**
 * One day of records. Activities that cross midnight show only the part that
 * falls inside this day (`dayStart` to `dayEnd`, UTC), with its own time range.
 */
export function DayTimeline({
    dayEnd,
    dayStart,
    entries,
    locale,
    timeFormat,
    timeZone,
    title,
    weighIns,
    weightUnit,
}: Readonly<{
    dayEnd: string;
    dayStart: string;
    entries: Entry[];
    locale: Locale;
    timeFormat: TimeFormat;
    timeZone: string;
    title?: string;
    weighIns: WeighIn[];
    weightUnit: WeightUnit;
}>) {
    const time = (value: string) => formatTime(value, locale, timeZone, timeFormat);
    const loneSnacks = loneSnackIds(entries, timeZone);
    const rows: TimelineRow[] = [
        ...entries.map((entry) => {
            const base = {
                id: `entry-${entry.id}`,
                kind: entry.kind,
                title: entryDisplayLabel(entry, locale, loneSnacks),
            };
            if (entry.kind === "meal") return { ...base, at: entry.startAt, detail: entry.text };
            const segment = clipToDay(entry, dayStart, dayEnd);
            // A part that runs into the next day ends at 23:59 on this one.
            const end = segment.intoNextDay
                ? time(new Date(Date.parse(dayEnd) - 60_000).toISOString())
                : segment.endAt
                  ? time(segment.endAt)
                  : translate(locale, "dashboard.inProgress");
            const parts = [
                `${time(segment.startAt)}–${end}`,
                formatDuration(segment.startAt, segment.endAt, locale),
                entry.text,
            ];
            return { ...base, at: segment.startAt, detail: parts.filter(Boolean).join(" · ") };
        }),
        ...weighIns.map((weighIn) => ({
            at: weighIn.recordedAt,
            detail: translate(locale, "dashboard.weight"),
            id: `weight-${weighIn.id}`,
            kind: "weight" as const,
            title: formatWeight(weighIn.weightGrams, weightUnit, locale),
        })),
    ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

    return (
        <section aria-labelledby="timeline-title" className="card">
            <div className="card-heading">
                <h2 id="timeline-title">{title ?? translate(locale, "dashboard.dayTitle")}</h2>
                <span className="pill numeric">
                    {translate(locale, "dashboard.summaryEntries", { count: rows.length })}
                </span>
            </div>
            {rows.length === 0 ? (
                <div className="empty-state">
                    <span className="state-icon">
                        <CalendarHeart aria-hidden="true" size={28} />
                    </span>
                    <p>{translate(locale, "dashboard.dayEmpty")}</p>
                </div>
            ) : (
                <ol className="timeline">
                    {rows.map((row) => (
                        <li className="timeline-row" key={row.id}>
                            <time className="numeric" dateTime={row.at}>
                                {formatTime(row.at, locale, timeZone, timeFormat)}
                            </time>
                            <KindIcon kind={row.kind} />
                            <div className="timeline-text">
                                <strong>{row.title}</strong>
                                <span>{row.detail}</span>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
