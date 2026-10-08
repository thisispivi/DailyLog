import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { HistoryWorkspace } from "@/features/history/ui/history-workspace";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./history.css";

export const metadata = { title: "History" };

export default function HistoryPage() {
    const environment = getEnvironment();
    const logbook = new LogbookRepository();
    const settings = logbook.getSettings(environment.ownerId);
    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(settings.locale, "app.tagline")}</p>
                    <h1>{translate(settings.locale, "history.title")}</h1>
                </div>
            </header>
            <HistoryWorkspace
                entries={logbook.listEntries(environment.ownerId, { limit: 100, offset: 0 }).items}
                locale={settings.locale}
                timeZone={environment.timezone}
                trash={logbook.listTrash(environment.ownerId)}
                weighIns={logbook.listWeighIns(environment.ownerId, { limit: 100 })}
                weightUnit={settings.weightUnit}
            />
        </>
    );
}
