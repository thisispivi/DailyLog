import Link from "next/link";

import { translate } from "@/core/i18n/translate";
import { readPreferenceCookies } from "@/core/preferences/preference-cookies";
import { RobotMark } from "@/ui/robot-mark";

export default async function NotFound() {
    const { locale } = await readPreferenceCookies();
    return (
        <main className="standalone-state">
            <div className="state-card card">
                <RobotMark size={72} />
                <p className="eyebrow">404</p>
                <h1>{translate(locale, "common.notFound")}</h1>
                <Link className="button button-primary" href="/today">
                    {translate(locale, "common.back")}
                </Link>
            </div>
        </main>
    );
}
