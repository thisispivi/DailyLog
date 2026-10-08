import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { ExportPanel } from "@/features/reports/ui/export-panel";
import { TrendCharts } from "@/features/reports/ui/trend-charts";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./reports.css";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, weightUnit } = logbook.getSettings(ownerId);
    const today = localDateInZone(new Date(), timezone);
    const monthStart = `${today.slice(0, 8)}01`;
    const [from, to] = localDateRangeBounds(monthStart, today, timezone);
    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(locale, "reports.thisMonth")}</p>
                    <h1>{translate(locale, "reports.title")}</h1>
                </div>
            </header>
            <div className="reports-layout">
                <TrendCharts
                    entries={logbook.listEntriesInRange(ownerId, from, to)}
                    locale={locale}
                    timeZone={timezone}
                    weighIns={logbook.listWeighIns(ownerId, { from, to })}
                    weightUnit={weightUnit}
                />
                <ExportPanel defaultFrom={monthStart} defaultTo={today} locale={locale} />
            </div>
        </>
    );
}
