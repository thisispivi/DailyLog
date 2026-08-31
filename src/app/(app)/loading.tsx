import { cookies } from "next/headers";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

export default async function Loading() {
    const locale: Locale = (await cookies()).get("dailylog_locale")?.value === "it" ? "it" : "en";
    return (
        <div className="page-loading" role="status">
            <span className="sr-only">{translate(locale, "common.loading")}</span>
            <i />
            <i />
            <i />
        </div>
    );
}
