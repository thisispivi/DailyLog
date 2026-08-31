import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { ExportPanel } from "@/features/reports/ui/export-panel";
import { TrendCharts } from "@/features/reports/ui/trend-charts";
import { repository } from "@/infrastructure/database/logbook-repository";

import "./reports.css";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
    const environment = getEnvironment();
    const logbook = repository();
    const settings = logbook.getSettings(environment.ownerId);
    const today = localDateInZone(new Date(), environment.timezone);
    const monthStart = `${today.slice(0, 8)}01`;
    const [from, to] = localDateRangeBounds(monthStart, today, environment.timezone);
    const entries = logbook.listAllEntries(environment.ownerId, from, to);
    const weights = logbook.listWeighIns(environment.ownerId, from, to, 500);
    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(settings.locale, "app.tagline")}</p>
                    <h1>{translate(settings.locale, "reports.title")}</h1>
                </div>
            </header>
            <div className="reports-layout">
                <TrendCharts
                    entries={entries}
                    locale={settings.locale}
                    timeZone={environment.timezone}
                    weighIns={weights}
                    weightUnit={settings.weightUnit}
                />
                <ExportPanel defaultFrom={monthStart} defaultTo={today} locale={settings.locale} />
            </div>
        </>
    );
}
