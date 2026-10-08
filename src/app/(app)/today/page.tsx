import { getEnvironment } from "@/core/config/env";
import { formatDate, formatWeight, translate } from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { summarizeDay } from "@/features/dashboard/dashboard-summary";
import { ActiveActivity } from "@/features/dashboard/ui/active-activity";
import { DayTimeline } from "@/features/dashboard/ui/day-timeline";
import { QuickLog } from "@/features/dashboard/ui/quick-log";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./today.css";

export const metadata = { title: "Today" };

export default function TodayPage() {
    const environment = getEnvironment();
    const logbook = new LogbookRepository();
    const settings = logbook.getSettings(environment.ownerId);
    const now = new Date();
    const today = localDateInZone(now, environment.timezone);
    const [from, to] = localDateRangeBounds(today, today, environment.timezone);
    const entries = logbook.listEntriesInRange(environment.ownerId, from, to);
    const weighIns = logbook.listWeighIns(environment.ownerId, { from, to });
    const active = logbook.activeActivity(environment.ownerId);
    const summary = summarizeDay(entries, weighIns);
    const hour = Number(
        new Intl.DateTimeFormat("en", {
            hour: "2-digit",
            hourCycle: "h23",
            timeZone: environment.timezone,
        }).format(now),
    );
    const period = hour < 12 ? "periodMorning" : hour < 18 ? "periodAfternoon" : "periodEvening";
    return (
        <>
            <header className="page-header today-header">
                <div>
                    <p className="eyebrow">
                        {formatDate(now, settings.locale, environment.timezone)}
                    </p>
                    <h1>
                        {translate(settings.locale, "dashboard.greeting", {
                            period: translate(settings.locale, `dashboard.${period}`),
                        })}
                    </h1>
                </div>
                <div
                    className="day-summary"
                    aria-label={translate(settings.locale, "dashboard.dayTitle")}
                >
                    <span>
                        <strong>{summary.trainingMinutes}</strong>
                        {translate(settings.locale, "dashboard.summaryTraining", {
                            minutes: "",
                        }).trim()}
                    </span>
                    <span>
                        <strong>{summary.sleepHours}</strong>
                        {translate(settings.locale, "dashboard.summarySleep", { hours: "" }).trim()}
                    </span>
                    {summary.weight && (
                        <span>
                            <strong>
                                {formatWeight(
                                    summary.weight.weightGrams,
                                    settings.weightUnit,
                                    settings.locale,
                                )}
                            </strong>
                        </span>
                    )}
                </div>
            </header>
            {active && <ActiveActivity activity={active} locale={settings.locale} />}
            <div className="today-layout">
                <QuickLog
                    hasActiveActivity={Boolean(active)}
                    locale={settings.locale}
                    timeZone={environment.timezone}
                    weightUnit={settings.weightUnit}
                />
                <DayTimeline
                    entries={entries}
                    locale={settings.locale}
                    timeZone={environment.timezone}
                    weighIns={weighIns}
                    weightUnit={settings.weightUnit}
                />
            </div>
        </>
    );
}
