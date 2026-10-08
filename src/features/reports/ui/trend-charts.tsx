import { formatDateTime, formatWeight, translate } from "@/core/i18n/translate";
import type { Entry, Locale, WeighIn, WeightUnit } from "@/features/logbook/domain";

export function TrendCharts({
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
    const activity = Object.entries(
        entries
            .filter((entry) => entry.kind === "training")
            .reduce<Record<string, number>>((totals, entry) => {
                if (!entry.endAt) return totals;
                totals[entry.label] =
                    (totals[entry.label] ?? 0) +
                    (Date.parse(entry.endAt) - Date.parse(entry.startAt)) / 60_000;
                return totals;
            }, {}),
    )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5);
    const maxActivity = Math.max(...activity.map(([, minutes]) => minutes), 1);
    const weights = [...weighIns].reverse().slice(-12);
    const first = weights[0];
    const last = weights.at(-1);
    const weightValues = weights.map((item) => item.weightGrams);
    const minWeight = weightValues.length ? Math.min(...weightValues) : 0;
    const maxWeight = weightValues.length ? Math.max(...weightValues) : 1;
    const points = weights
        .map(
            (item, index) =>
                `${weights.length === 1 ? 50 : (index / (weights.length - 1)) * 100},${92 - ((item.weightGrams - minWeight) / Math.max(maxWeight - minWeight, 1)) * 80}`,
        )
        .join(" ");
    return (
        <div className="trend-stack">
            <section className="trend-card trend-primary">
                <p className="eyebrow">{translate(locale, "reports.weightSheet")}</p>
                <h2>{translate(locale, "reports.weightQuestion")}</h2>
                {first && last ? (
                    <>
                        <svg
                            aria-label={translate(locale, "reports.weightQuestion")}
                            className="weight-chart"
                            preserveAspectRatio="none"
                            role="img"
                            viewBox="0 0 100 100"
                        >
                            <polyline
                                fill="none"
                                points={points}
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                            />
                        </svg>
                        <div className="chart-endpoints">
                            <span>{formatWeight(first.weightGrams, weightUnit, locale)}</span>
                            <strong>{formatWeight(last.weightGrams, weightUnit, locale)}</strong>
                        </div>
                        <table className="sr-only">
                            <tbody>
                                {weights.map((item) => (
                                    <tr key={item.id}>
                                        <td>{formatDateTime(item.recordedAt, locale, timeZone)}</td>
                                        <td>
                                            {formatWeight(item.weightGrams, weightUnit, locale)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                ) : (
                    <p className="muted">{translate(locale, "reports.empty")}</p>
                )}
            </section>
            <section className="trend-card surface">
                <p className="eyebrow">{translate(locale, "dashboard.training")}</p>
                <h2>{translate(locale, "reports.activityQuestion")}</h2>
                {activity.length ? (
                    <ul className="activity-bars">
                        {activity.map(([label, minutes]) => (
                            <li key={label}>
                                <div>
                                    <strong>{label}</strong>
                                    <span>{Math.round(minutes)} min</span>
                                </div>
                                <span className="bar-track">
                                    <span style={{ width: `${(minutes / maxActivity) * 100}%` }} />
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="muted">{translate(locale, "reports.empty")}</p>
                )}
            </section>
        </div>
    );
}
