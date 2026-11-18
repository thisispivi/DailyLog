import type { TranslationKey } from "@/core/i18n/catalogs";
import { translate } from "@/core/i18n/translate";
import type { Locale, Theme } from "@/features/logbook/domain";
import { LogbookRepository } from "@/infrastructure/database/logbook-repository";

/** The demo reads preferences straight from its database instead of cookies. */
export async function readPreferenceCookies(): Promise<{ locale: Locale; theme: Theme }> {
    const { locale, theme } = new LogbookRepository().getSettings(1);
    return { locale, theme };
}

export function writePreferenceCookies(): void {}

export async function localizedTitle(key: TranslationKey): Promise<{ title: string }> {
    const { locale } = await readPreferenceCookies();
    return { title: translate(locale, key) };
}
