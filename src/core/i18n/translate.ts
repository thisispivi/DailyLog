import { catalogs, type PluralForms, type TranslationKey } from "@/core/i18n/catalogs";
import { gramsToUnit, type Locale, type WeightUnit } from "@/features/logbook/domain";

export function translate(
    locale: Locale,
    key: TranslationKey,
    values: Record<string, string | number> = {},
): string {
    const [namespace, name] = key.split(".") as [keyof (typeof catalogs)["en"], string];
    const section = catalogs[locale][namespace] as Readonly<Record<string, string | PluralForms>>;
    const entry = section[name];
    if (!entry) throw new Error(`Missing translation: ${locale}.${key}`);
    const template =
        typeof entry === "string" ? entry : entry[pluralCategory(locale, values.count)];
    return template.replace(/\{(\w+)\}/g, (match, token: string) =>
        Object.hasOwn(values, token) ? String(values[token]) : match,
    );
}

/** English and Italian only distinguish "one" from everything else. */
function pluralCategory(locale: Locale, count: string | number | undefined): keyof PluralForms {
    return new Intl.PluralRules(locale).select(Number(count ?? 0)) === "one" ? "one" : "other";
}

export function formatDateTime(value: string | Date, locale: Locale, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
    }).format(new Date(value));
}

export function formatDate(value: string | Date, locale: Locale, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(new Date(value));
}

export function formatTime(value: string | Date, locale: Locale, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(
        new Date(value),
    );
}

export function formatWeight(grams: number, unit: WeightUnit, locale: Locale): string {
    const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        gramsToUnit(grams, unit),
    );
    return `${value} ${unit}`;
}

export function formatDuration(startAt: string, endAt: string | null, locale: Locale): string {
    const end = Date.parse(endAt ?? new Date().toISOString());
    return formatMinutes(Math.max(0, end - Date.parse(startAt)) / 60_000, locale);
}

/** "45 min", "8 h", or "7 h 30 min". */
export function formatMinutes(totalMinutes: number, locale: Locale): string {
    const minutes = Math.round(totalMinutes);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours === 0) return `${new Intl.NumberFormat(locale).format(minutes)} min`;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}
