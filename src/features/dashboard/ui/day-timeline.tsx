import { CalendarHeart } from "lucide-react";

import { formatDuration, formatTime, formatWeight, translate } from "@/core/i18n/translate";
import type { Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";

type TimelineRow = Readonly<{
    at: string;
    detail: string;
    id: string;
    kind: RecordKind;
    title: string;
}>;

export function DayTimeline({
    entries,
    locale,
    timeZone,
    weighIns,
    weightUnit,
}: Readonly<{
    entries: Entry[];
    locale: Locale;
    timeZone: string;
    weighIns: WeighIn[];
    weightUnit: WeightUnit;
}>) {
    const rows: TimelineRow[] = [
        ...entries.map((entry) => ({
            at: entry.startAt,
            detail:
                entry.text ||
                (entry.endAt
                    ? formatDuration(entry.startAt, entry.endAt, locale)
                    : translate(locale, "dashboard.inProgress")),
            id: `entry-${entry.id}`,
            kind: entry.kind,
            title: entry.label,
        })),
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
                <h2 id="timeline-title">{translate(locale, "dashboard.dayTitle")}</h2>
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
                                {formatTime(row.at, locale, timeZone)}
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
