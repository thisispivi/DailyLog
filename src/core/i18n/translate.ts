import { catalogs, type TranslationKey } from "@/core/i18n/catalogs";
import { gramsToUnit, type Locale, type WeightUnit } from "@/features/logbook/domain";

export function translate(
    locale: Locale,
    key: TranslationKey,
    values: Record<string, string | number> = {},
): string {
    const [namespace, name] = key.split(".") as [keyof (typeof catalogs)["en"], string];
    const section = catalogs[locale][namespace] as Readonly<Record<string, string>>;
    const template = section[name];
    if (!template) throw new Error(`Missing translation: ${locale}.${key}`);
    return template.replace(/\{(\w+)\}/g, (match, token: string) =>
        Object.hasOwn(values, token) ? String(values[token]) : match,
    );
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
    const milliseconds = Math.max(
        0,
        Date.parse(endAt ?? new Date().toISOString()) - Date.parse(startAt),
    );
    const minutes = Math.round(milliseconds / 60_000);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours === 0) return new Intl.NumberFormat(locale).format(minutes) + " min";
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}
