import { formatDuration, formatTime, formatWeight, translate } from "@/core/i18n/translate";
import type { Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";
import { KindIcon } from "@/ui/kind-icon";

type TimelineRow = Readonly<{
    at: string;
    detail: string;
    id: string;
    kind: Entry["kind"] | "weight";
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
                    : translate(locale, `dashboard.${entry.kind}`)),
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
        <section aria-labelledby="timeline-title" className="day-timeline card">
            <div className="card-heading">
                <h2 id="timeline-title">{translate(locale, "dashboard.dayTitle")}</h2>
                <span className="count-pill">
                    {translate(locale, "dashboard.summaryEntries", { count: rows.length })}
                </span>
            </div>
            {rows.length === 0 ? (
                <div className="empty-state">
                    <p>{translate(locale, "dashboard.dayEmpty")}</p>
                </div>
            ) : (
                <ol className="timeline-list">
                    {rows.map((row) => (
                        <li className="timeline-row" data-kind={row.kind} key={row.id}>
                            <KindIcon kind={row.kind} />
                            <div className="timeline-text">
                                <strong>{row.title}</strong>
                                <span>{row.detail}</span>
                            </div>
                            <time dateTime={row.at}>{formatTime(row.at, locale, timeZone)}</time>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
