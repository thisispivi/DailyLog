import { translate } from "@/core/i18n/translate";
import { readPreferenceCookies } from "@/core/preferences/preference-cookies";

export default async function Loading() {
    const { locale } = await readPreferenceCookies();
    return (
        <div className="page-loading" role="status">
            <span className="sr-only">{translate(locale, "common.loading")}</span>
            <i />
            <i />
            <i />
        </div>
    );
}
