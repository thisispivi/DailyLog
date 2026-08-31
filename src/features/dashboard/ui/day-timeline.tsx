import { Dumbbell, Moon, Scale, Utensils } from "lucide-react";

import { formatDuration, formatTime, formatWeight, translate } from "@/core/i18n/translate";
import type { Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";

type TimelineRecord =
    { at: string; entry: Entry; type: "entry" } | { at: string; type: "weight"; weighIn: WeighIn };

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
    const records: TimelineRecord[] = [
        ...entries.map((entry): TimelineRecord => ({ at: entry.startAt, entry, type: "entry" })),
        ...weighIns.map((weighIn): TimelineRecord => ({
            at: weighIn.recordedAt,
            type: "weight",
            weighIn,
        })),
    ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
    return (
        <section className="day-timeline surface" aria-labelledby="timeline-title">
            <div className="timeline-heading">
                <h2 id="timeline-title">{translate(locale, "dashboard.dayTitle")}</h2>
                <span>
                    {translate(locale, "dashboard.summaryEntries", { count: records.length })}
                </span>
            </div>
            {records.length === 0 ? (
                <div className="empty-state">{translate(locale, "dashboard.dayEmpty")}</div>
            ) : (
                <ol className="timeline-list">
                    {records.map((record) => {
                        if (record.type === "weight") {
                            return (
                                <li className="timeline-row" key={`weight-${record.weighIn.id}`}>
                                    <span className="timeline-icon">
                                        <Scale aria-hidden="true" size={18} />
                                    </span>
                                    <div>
                                        <strong>
                                            {formatWeight(
                                                record.weighIn.weightGrams,
                                                weightUnit,
                                                locale,
                                            )}
                                        </strong>
                                        <span>{translate(locale, "dashboard.weight")}</span>
                                    </div>
                                    <time>{formatTime(record.at, locale, timeZone)}</time>
                                </li>
                            );
                        }
                        const entry = record.entry;
                        const Icon =
                            entry.kind === "meal"
                                ? Utensils
                                : entry.kind === "sleep"
                                  ? Moon
                                  : Dumbbell;
                        return (
                            <li className="timeline-row" key={`entry-${entry.id}`}>
                                <span className="timeline-icon">
                                    <Icon aria-hidden="true" size={18} />
                                </span>
                                <div>
                                    <strong>{entry.label}</strong>
                                    <span>
                                        {entry.text ||
                                            (entry.endAt
                                                ? formatDuration(entry.startAt, entry.endAt, locale)
                                                : translate(locale, "common.start"))}
                                    </span>
                                </div>
                                <time>{formatTime(entry.startAt, locale, timeZone)}</time>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
