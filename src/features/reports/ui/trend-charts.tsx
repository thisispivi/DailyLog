import { formatDateTime, formatWeight, translate } from "@/core/i18n/translate";
import {
    entryDurationMs,
    type Entry,
    type Locale,
    type WeighIn,
    type WeightUnit,
} from "@/features/logbook/domain";
import { KindIcon } from "@/ui/kind-icon";

const MAX_WEIGHT_POINTS = 12;
const MAX_ACTIVITY_BARS = 5;

type Props = Readonly<{
    entries: Entry[];
    locale: Locale;
    timeZone: string;
    weighIns: WeighIn[];
    weightUnit: WeightUnit;
}>;

export function TrendCharts(props: Props) {
    return (
        <div className="trend-stack">
            <WeightTrend {...props} />
            <TrainingBreakdown entries={props.entries} locale={props.locale} />
        </div>
    );
}

/** `weighIns` arrive newest first; the chart reads left to right, oldest first. */
function WeightTrend({ locale, timeZone, weighIns, weightUnit }: Props) {
    const points = weighIns.slice(0, MAX_WEIGHT_POINTS).reverse();
    const first = points[0];
    const last = points.at(-1);
    const grams = points.map((point) => point.weightGrams);
    const low = Math.min(...grams);
    const span = Math.max(Math.max(...grams) - low, 1);
    const coordinates = points.map((point, index) => ({
        x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100,
        y: 88 - ((point.weightGrams - low) / span) * 72,
    }));
    const line = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
    const title = translate(locale, "reports.weightQuestion");

    return (
        <section className="trend-card card" data-kind="weight">
            <header className="trend-heading">
                <KindIcon kind="weight" />
                <div>
                    <p className="eyebrow">{translate(locale, "reports.weightSheet")}</p>
                    <h2>{title}</h2>
                </div>
            </header>
            {first && last ? (
                <>
                    <svg
                        aria-label={title}
                        className="weight-chart"
                        preserveAspectRatio="none"
                        role="img"
                        viewBox="0 0 100 100"
                    >
                        <defs>
                            <linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="var(--kind)" stopOpacity="0.32" />
                                <stop offset="100%" stopColor="var(--kind)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <polygon fill="url(#weight-fill)" points={`0,100 ${line} 100,100`} />
                        <polyline
                            fill="none"
                            points={line}
                            stroke="var(--kind)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    <div className="chart-endpoints">
                        <span>{formatWeight(first.weightGrams, weightUnit, locale)}</span>
                        <strong>{formatWeight(last.weightGrams, weightUnit, locale)}</strong>
                    </div>
                    <table className="sr-only">
                        <tbody>
                            {points.map((point) => (
                                <tr key={point.id}>
                                    <td>{formatDateTime(point.recordedAt, locale, timeZone)}</td>
                                    <td>{formatWeight(point.weightGrams, weightUnit, locale)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            ) : (
                <p className="muted">{translate(locale, "reports.empty")}</p>
            )}
        </section>
    );
}

function TrainingBreakdown({ entries, locale }: Readonly<{ entries: Entry[]; locale: Locale }>) {
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
        <section className="trend-card card" data-kind="training">
            <header className="trend-heading">
                <KindIcon kind="training" />
                <div>
                    <p className="eyebrow">{translate(locale, "dashboard.training")}</p>
                    <h2>{translate(locale, "reports.activityQuestion")}</h2>
                </div>
            </header>
            {bars.length ? (
                <ul className="activity-bars">
                    {bars.map(([label, minutes]) => (
                        <li key={label}>
                            <div>
                                <strong>{label}</strong>
                                <span>{Math.round(minutes)} min</span>
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
        </section>
    );
}
