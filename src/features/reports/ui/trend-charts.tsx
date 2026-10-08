import type { ReactNode } from "react";

import { formatDate, formatMinutes, formatWeight, translate } from "@/core/i18n/translate";
import type { DayTotals } from "@/features/insights/insights";
import {
    entryDurationMs,
    type Entry,
    type Locale,
    type WeightUnit,
} from "@/features/logbook/domain";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";

const MAX_ACTIVITY_BARS = 5;

type ChartProps = Readonly<{ days: readonly DayTotals[]; locale: Locale }>;

// Day keys are plain calendar dates, so they are formatted in UTC to avoid shifting.
const formatDay = (date: string, locale: Locale) => formatDate(`${date}T12:00:00Z`, locale, "UTC");

function ChartCard({
    children,
    kind,
    title,
}: Readonly<{ children: ReactNode; kind: RecordKind; title: string }>) {
    return (
        <section className="card" data-kind={kind}>
            <header className="chart-heading">
                <KindIcon kind={kind} />
                <h2>{title}</h2>
            </header>
            {children}
        </section>
    );
}

/** One bar per night, credited to the morning you woke up. */
export function SleepChart({ days, locale }: ChartProps) {
    const title = translate(locale, "reports.sleepQuestion");
    const longest = Math.max(...days.map((day) => day.sleepMinutes), 1);
    return (
        <ChartCard kind="sleep" title={title}>
            {days.some((day) => day.sleepMinutes > 0) ? (
                <>
                    <ol aria-hidden="true" className="sleep-bars">
                        {days.map((day) => (
                            <li key={day.date}>
                                <span
                                    className="sleep-bar"
                                    style={{ height: `${(day.sleepMinutes / longest) * 100}%` }}
                                />
                                <span className="sleep-day">{dayLetter(day.date, locale)}</span>
                            </li>
                        ))}
                    </ol>
                    <table className="sr-only">
                        <caption>{title}</caption>
                        <tbody>
                            {days.map((day) => (
                                <tr key={day.date}>
                                    <td>{formatDay(day.date, locale)}</td>
                                    <td>{formatMinutes(day.sleepMinutes, locale)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            ) : (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            )}
        </ChartCard>
    );
}

export function WeightChart({
    days,
    locale,
    weightUnit,
}: ChartProps & Readonly<{ weightUnit: WeightUnit }>) {
    const title = translate(locale, "reports.weightQuestion");
    const points = days.flatMap((day) =>
        day.weightGrams === null ? [] : [{ date: day.date, grams: day.weightGrams }],
    );
    const first = points[0];
    const last = points.at(-1);
    const grams = points.map((point) => point.grams);
    const low = Math.min(...grams);
    const span = Math.max(Math.max(...grams) - low, 1);
    const line = points
        .map((point, index) => {
            const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
            const y = 86 - ((point.grams - low) / span) * 70;
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <ChartCard kind="weight" title={title}>
            {first && last ? (
                <>
                    <svg
                        aria-label={title}
                        className="weight-chart"
                        preserveAspectRatio="none"
                        role="img"
                        viewBox="0 0 100 100"
                    >
                        <polygon className="weight-area" points={`0,100 ${line} 100,100`} />
                        <polyline
                            className="weight-line"
                            fill="none"
                            points={line}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    <div className="chart-endpoints numeric">
                        <span>{formatWeight(first.grams, weightUnit, locale)}</span>
                        <strong>{formatWeight(last.grams, weightUnit, locale)}</strong>
                    </div>
                    <table className="sr-only">
                        <caption>{title}</caption>
                        <tbody>
                            {points.map((point) => (
                                <tr key={point.date}>
                                    <td>{formatDay(point.date, locale)}</td>
                                    <td>{formatWeight(point.grams, weightUnit, locale)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            ) : (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            )}
        </ChartCard>
    );
}

export function TrainingChart({ entries, locale }: Readonly<{ entries: Entry[]; locale: Locale }>) {
    const minutesByLabel = new Map<string, number>();
    for (const entry of entries) {
        if (entry.kind !== "training") continue;
        const minutes = entryDurationMs(entry) / 60_000;
        minutesByLabel.set(entry.label, (minutesByLabel.get(entry.label) ?? 0) + minutes);
    }
    const bars = [...minutesByLabel]
        .filter(([, minutes]) => minutes > 0)
        .sort((left, right) => right[1] - left[1])
        .slice(0, MAX_ACTIVITY_BARS);
    const longest = Math.max(...bars.map(([, minutes]) => minutes), 1);

    return (
        <ChartCard kind="training" title={translate(locale, "reports.activityQuestion")}>
            {bars.length ? (
                <ul className="activity-bars">
                    {bars.map(([label, minutes]) => (
                        <li key={label}>
                            <div>
                                <strong>{label}</strong>
                                <span className="numeric">{formatMinutes(minutes, locale)}</span>
                            </div>
                            <span className="bar-track">
                                <span style={{ width: `${(minutes / longest) * 100}%` }} />
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            )}
        </ChartCard>
    );
}

function dayLetter(date: string, locale: Locale): string {
    return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "narrow" }).format(
        new Date(`${date}T12:00:00Z`),
    );
}
