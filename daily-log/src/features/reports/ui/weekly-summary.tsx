import { formatMinutes, formatWeight, translate } from "@/core/i18n/translate";
import type { PeriodSummary } from "@/features/insights/insights";
import type { Locale, WeightUnit } from "@/features/logbook/domain";
import { KindIcon, type RecordKind } from "@/ui/kind-icon";

export function WeeklySummary({
    locale,
    summary,
    weightUnit,
}: Readonly<{ locale: Locale; summary: PeriodSummary; weightUnit: WeightUnit }>) {
    const change = summary.weightChangeGrams;
    const tiles: Array<{ kind: RecordKind; label: string; value: string }> = [
        {
            kind: "sleep",
            label: translate(locale, "reports.averageSleep"),
            value:
                summary.averageSleepMinutes === null
                    ? "–"
                    : formatMinutes(summary.averageSleepMinutes, locale),
        },
        {
            kind: "training",
            label: translate(locale, "reports.activeTime"),
            value: formatMinutes(summary.activeMinutes, locale),
        },
        {
            kind: "meal",
            label: translate(locale, "reports.mealsPerDay"),
            value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                summary.mealsPerDay,
            ),
        },
        {
            kind: "weight",
            label: translate(locale, "reports.weightChange"),
            value:
                change === null
                    ? "–"
                    : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${formatWeight(Math.abs(change), weightUnit, locale)}`,
        },
    ];
    return (
        <section aria-labelledby="week-title" className="card">
            <div className="card-heading">
                <h2 id="week-title">{translate(locale, "reports.lastSevenDays")}</h2>
            </div>
            <dl className="summary-tiles">
                {tiles.map((tile) => (
                    <div className="tile summary-tile" data-kind={tile.kind} key={tile.kind}>
                        <KindIcon kind={tile.kind} size="small" />
                        <dt>{tile.label}</dt>
                        <dd className="numeric">{tile.value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
