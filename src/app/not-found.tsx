import { Compass } from "lucide-react";
import Link from "next/link";

import { translate } from "@/core/i18n/translate";
import { readPreferenceCookies } from "@/core/preferences/preference-cookies";

export default async function NotFound() {
    const { locale } = await readPreferenceCookies();
    return (
        <main className="standalone-state">
            <div className="state-card card">
                <span className="state-icon">
                    <Compass aria-hidden="true" size={28} />
                </span>
                <h1>{translate(locale, "common.notFound")}</h1>
                <Link className="button button-primary" href="/today">
                    {translate(locale, "common.back")}
                </Link>
            </div>
        </main>
    );
}
