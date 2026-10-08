import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { datesEndingOn, localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { dailyTotals, summarizePeriod } from "@/features/insights/insights";
import { ExportPanel } from "@/features/reports/ui/export-panel";
import { SleepChart, TrainingChart, WeightChart } from "@/features/reports/ui/trend-charts";
import { WeeklySummary } from "@/features/reports/ui/weekly-summary";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./reports.css";

export const metadata = { title: "Reports" };

const TREND_DAYS = 30;
const SLEEP_NIGHTS = 14;
const SUMMARY_DAYS = 7;

export default function ReportsPage() {
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, weightUnit } = logbook.getSettings(ownerId);
    const today = localDateInZone(new Date(), timezone);
    const dates = datesEndingOn(today, TREND_DAYS);
    const [from, to] = localDateRangeBounds(dates[0] ?? today, today, timezone);
    const entries = logbook.listEntriesInRange(ownerId, from, to);
    const days = dailyTotals(
        dates,
        entries,
        logbook.listWeighIns(ownerId, { from, limit: null, to }),
        timezone,
    );

    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(locale, "reports.lastThirtyDays")}</p>
                    <h1>{translate(locale, "reports.title")}</h1>
                </div>
            </header>
            <div className="reports-layout">
                <div className="reports-main">
                    <WeeklySummary
                        locale={locale}
                        summary={summarizePeriod(days.slice(-SUMMARY_DAYS))}
                        weightUnit={weightUnit}
                    />
                    <div className="reports-charts">
                        <SleepChart days={days.slice(-SLEEP_NIGHTS)} locale={locale} />
                        <WeightChart days={days} locale={locale} weightUnit={weightUnit} />
                    </div>
                    <TrainingChart entries={entries} locale={locale} />
                </div>
                <ExportPanel
                    defaultFrom={dates[0] ?? today}
                    defaultTo={today}
                    locale={locale}
                    timeZone={timezone}
                />
            </div>
        </>
    );
}
