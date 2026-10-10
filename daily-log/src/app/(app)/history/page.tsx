import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { localizedTitle } from "@/core/preferences/preference-cookies";
import { HistoryWorkspace } from "@/features/history/ui/history-workspace";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./history.css";

export const generateMetadata = () => localizedTitle("nav.history");

// ponytail: the newest 100 entries and weigh-ins, filtered in the browser. Switch to
// /api/entries pagination when a year of history no longer fits comfortably.
const HISTORY_LIMIT = 100;

export default function HistoryPage() {
    const { ownerId, timezone } = getEnvironment();
    const logbook = new LogbookRepository();
    const { locale, timeFormat, weightUnit } = logbook.getSettings(ownerId);
    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(locale, "app.tagline")}</p>
                    <h1>{translate(locale, "history.title")}</h1>
                </div>
            </header>
            <HistoryWorkspace
                entries={logbook.listEntries(ownerId, { limit: HISTORY_LIMIT, offset: 0 }).items}
                locale={locale}
                timeFormat={timeFormat}
                timeZone={timezone}
                trash={logbook.listTrash(ownerId)}
                weighIns={logbook.listWeighIns(ownerId, { limit: HISTORY_LIMIT })}
                weightUnit={weightUnit}
            />
        </>
    );
}
