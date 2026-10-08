import { getEnvironment } from "@/core/config/env";
import { translate } from "@/core/i18n/translate";
import { SettingsForm } from "@/features/settings/ui/settings-form";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

import "./settings.css";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
    const settings = new LogbookRepository().getSettings(getEnvironment().ownerId);
    return (
        <>
            <header className="page-header">
                <div>
                    <p className="eyebrow">{translate(settings.locale, "app.tagline")}</p>
                    <h1>{translate(settings.locale, "settings.title")}</h1>
                </div>
            </header>
            <SettingsForm initial={settings} />
        </>
    );
}
