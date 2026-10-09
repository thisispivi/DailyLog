import { Flame } from "lucide-react";

import { getEnvironment } from "@/core/config/env";
import { formatDate, formatMinutes, formatWeight, translate } from "@/core/i18n/translate";
import { localizedTitle } from "@/core/preferences/preference-cookies";
import {
    localDateInZone,
    localDateRangeBounds,
    localHour,
    shiftDate,
} from "@/core/time/zoned-time";
import { ActiveActivity } from "@/features/dashboard/ui/active-activity";
import { DayTimeline } from "@/features/dashboard/ui/day-timeline";
import {
    AddRecordButton,
    LogTile,
    RecordLoggerProvider,
} from "@/features/dashboard/ui/record-logger";
import { dailyTotals, loggingStreak } from "@/features/insights/insights";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";
import type { RecordKind } from "@/ui/kind-icon";

import "./today.css";

export const generateMetadata = () => localizedTitle("nav.dashboard");

// ponytail: streaks look back one year at most; switch to a stored counter if that ever matters.
const STREAK_LOOKBACK_DAYS = 365;

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
    const lastWeighIn = logbook.listWeighIns(ownerId, { limit: 1 })[0];
    const [totals] = dailyTotals([today], entries, weighIns, timezone);

    const [streakFrom] = localDateRangeBounds(
        shiftDate(today, -STREAK_LOOKBACK_DAYS),
        today,
        timezone,
    );
    const recordDates = new Set(
        logbook
            .recordTimestamps(ownerId, streakFrom)
            .map((timestamp) => localDateInZone(new Date(timestamp), timezone)),
    );
    const streak = loggingStreak(recordDates, today);

    const tiles: Array<{ kind: RecordKind; label: string; value: string }> = [
        {
            kind: "meal",
            label: translate(locale, "dashboard.statMeals"),
            value: String(totals?.meals ?? 0),
        },
        {
            kind: "training",
            label: translate(locale, "dashboard.statTraining"),
            value: formatMinutes(totals?.activeMinutes ?? 0, locale),
        },
        {
            kind: "sleep",
            label: translate(locale, "dashboard.statSleep"),
            value: totals?.sleepMinutes ? formatMinutes(totals.sleepMinutes, locale) : "–",
        },
        {
            kind: "weight",
            label: translate(locale, "dashboard.weight"),
            value: lastWeighIn ? formatWeight(lastWeighIn.weightGrams, weightUnit, locale) : "–",
        },
    ];

    const addLabel = translate(locale, "dashboard.addRecord");

    return (
        <RecordLoggerProvider
            hasActiveActivity={Boolean(active)}
            lastWeightGrams={lastWeighIn?.weightGrams ?? null}
            locale={locale}
            recentTrainingLabels={logbook.recentLabels(ownerId, "training")}
            timeZone={timezone}
            weightUnit={weightUnit}
        >
            <header className="page-header">
                <div>
                    <p className="eyebrow">{formatDate(now, locale, timezone)}</p>
                    <h1>
                        {translate(locale, "dashboard.greeting", {
                            period: translate(locale, `dashboard.${dayPeriod(now, timezone)}`),
                        })}
                    </h1>
                </div>
                <div className="today-actions">
                    {streak > 0 && (
                        <span className="pill streak numeric">
                            <Flame aria-hidden="true" size={16} />
                            {translate(locale, "dashboard.streak", { count: streak })}
                        </span>
                    )}
                    <AddRecordButton label={addLabel} />
                </div>
            </header>
            {active && <ActiveActivity activity={active} locale={locale} />}
            <ul className="today-tiles">
                {tiles.map((tile) => (
                    <li key={tile.kind}>
                        <LogTile actionLabel={addLabel} {...tile} />
                    </li>
                ))}
            </ul>
            <DayTimeline
                entries={entries}
                locale={locale}
                timeZone={timezone}
                weighIns={weighIns}
                weightUnit={weightUnit}
            />
        </RecordLoggerProvider>
    );
}

function dayPeriod(now: Date, timeZone: string) {
    const hour = localHour(now, timeZone);
    if (hour < 12) return "periodMorning";
    return hour < 18 ? "periodAfternoon" : "periodEvening";
}
