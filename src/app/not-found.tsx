import { cookies } from "next/headers";
import Link from "next/link";

import { translate } from "@/core/i18n/translate";
import type { Locale } from "@/features/logbook/domain";

export default async function NotFound() {
    const locale: Locale = (await cookies()).get("dailylog_locale")?.value === "it" ? "it" : "en";
    return (
        <main className="standalone-state">
            <div className="surface raised">
                <p className="eyebrow">404</p>
                <h1>{translate(locale, "common.notFound")}</h1>
                <Link className="button button-primary" href="/today">
                    {translate(locale, "common.back")}
                </Link>
            </div>
        </main>
    );
}
