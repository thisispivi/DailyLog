import { getEnvironment } from "@/core/config/env";
import { formatDate, formatWeight, translate } from "@/core/i18n/translate";
import { localDateInZone, localDateRangeBounds } from "@/core/time/zoned-time";
import { summarizeDay } from "@/features/dashboard/dashboard-summary";
import { ActiveActivity } from "@/features/dashboard/ui/active-activity";
import { DayTimeline } from "@/features/dashboard/ui/day-timeline";
import { QuickLog } from "@/features/dashboard/ui/quick-log";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";
import { KindBadge, type RecordKind } from "@/ui/kind-badge";
import { RobotMark } from "@/ui/robot-mark";

import "./today.css";

export const metadata = { title: "Today" };

export default function TodayPage() {
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, weightUnit } = logbook.getSettings(ownerId);
    const now = new Date();
    const today = localDateInZone(now, timezone);
    const [from, to] = localDateRangeBounds(today, today, timezone);
    const entries = logbook.listEntriesInRange(ownerId, from, to);
    const weighIns = logbook.listWeighIns(ownerId, { from, to });
    const active = logbook.activeActivity(ownerId);
    const summary = summarizeDay(entries, weighIns);
    const stats: Array<{ kind: RecordKind; label: string; value: string }> = [
        {
            kind: "meal",
            label: translate(locale, "dashboard.statMeals"),
            value: String(entries.filter((entry) => entry.kind === "meal").length),
        },
        {
            kind: "training",
            label: translate(locale, "dashboard.statTraining"),
            value: `${summary.trainingMinutes} min`,
        },
        {
            kind: "sleep",
            label: translate(locale, "dashboard.statSleep"),
            value: `${summary.sleepHours} h`,
        },
        {
            kind: "weight",
            label: translate(locale, "dashboard.weight"),
            value: summary.weight
                ? formatWeight(summary.weight.weightGrams, weightUnit, locale)
                : "–",
        },
    ];
    return (
        <>
            <header className="today-hero navy-panel">
                <div className="today-hero-text">
                    <p className="eyebrow">{formatDate(now, locale, timezone)}</p>
                    <h1>
                        {translate(locale, "dashboard.greeting", {
                            period: translate(locale, `dashboard.${dayPeriod(now, timezone)}`),
                        })}
                    </h1>
                </div>
                <RobotMark className="today-hero-robot" size={88} />
                <dl className="today-stats">
                    {stats.map((stat) => (
                        <div className="today-stat" key={stat.kind}>
                            <KindBadge kind={stat.kind} size="small" />
                            <dt>{stat.label}</dt>
                            <dd>{stat.value}</dd>
                        </div>
                    ))}
                </dl>
            </header>
            {active && <ActiveActivity activity={active} locale={locale} />}
            <div className="today-layout">
                <QuickLog
                    hasActiveActivity={Boolean(active)}
                    locale={locale}
                    timeZone={timezone}
                    weightUnit={weightUnit}
                />
                <DayTimeline
                    entries={entries}
                    locale={locale}
                    timeZone={timezone}
                    weighIns={weighIns}
                    weightUnit={weightUnit}
                />
            </div>
        </>
    );
}

function dayPeriod(now: Date, timeZone: string) {
    const hour = Number(
        new Intl.DateTimeFormat("en", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now),
    );
    if (hour < 12) return "periodMorning";
    return hour < 18 ? "periodAfternoon" : "periodEvening";
}
