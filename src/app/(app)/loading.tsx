import { translate } from "@/core/i18n/translate";
import { readPreferenceCookies } from "@/core/preferences/preference-cookies";
import { RobotMark } from "@/ui/robot-mark";

export default async function Loading() {
    const { locale } = await readPreferenceCookies();
    return (
        <div className="page-loading" role="status">
            <RobotMark size={56} />
            <span className="sr-only">{translate(locale, "common.loading")}</span>
        </div>
    );
}
