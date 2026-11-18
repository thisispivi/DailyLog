import { catalogs, type PluralForms, type TranslationKey } from "@/core/i18n/catalogs";
import {
    gramsToUnit,
    type Locale,
    type NumberFormat,
    type TimeFormat,
    type WeightUnit,
} from "@/features/logbook/domain";

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

/** The Intl hour cycle for the owner's 12- or 24-hour preference. */
export function hourCycle(timeFormat: TimeFormat): "h12" | "h23" {
    return timeFormat === "12h" ? "h12" : "h23";
}

export function formatDateTime(
    value: string | Date,
    locale: Locale,
    timeZone: string,
    timeFormat: TimeFormat,
): string {
    // timeStyle ignores hourCycle, so the time fields are spelled out.
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "2-digit",
        hourCycle: hourCycle(timeFormat),
        minute: "2-digit",
        month: "short",
        timeZone,
        year: "numeric",
    }).format(new Date(value));
}

export function formatDate(value: string | Date, locale: Locale, timeZone: string): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(new Date(value));
}

export function formatTime(
    value: string | Date,
    locale: Locale,
    timeZone: string,
    timeFormat: TimeFormat,
): string {
    return new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        hourCycle: hourCycle(timeFormat),
        minute: "2-digit",
        timeZone,
    }).format(new Date(value));
}

/** A number format with "auto" resolved against the language it is shown in. */
export type NumberStyle = Exclude<NumberFormat, "auto">;

const separators: Readonly<Record<NumberStyle, { decimal: string; group: string }>> = {
    "apostrophe-dot": { decimal: ".", group: "’" },
    "comma-dot": { decimal: ".", group: "," },
    "dot-comma": { decimal: ",", group: "." },
    "space-comma": { decimal: ",", group: " " },
};

export function numberStyle(locale: Locale, format: NumberFormat): NumberStyle {
    if (format !== "auto") return format;
    return locale === "it" ? "dot-comma" : "comma-dot";
}

/** Formats with the chosen separators; every number from 1,000 up is grouped. */
export function formatNumber(
    value: number,
    style: NumberStyle,
    options: Intl.NumberFormatOptions = {},
): string {
    const { decimal, group } = separators[style];
    return new Intl.NumberFormat("en-US", options)
        .formatToParts(value)
        .map((part) =>
            part.type === "group" ? group : part.type === "decimal" ? decimal : part.value,
        )
        .join("");
}

export function formatWeight(grams: number, unit: WeightUnit, style: NumberStyle): string {
    return `${formatNumber(gramsToUnit(grams, unit), style, { maximumFractionDigits: 2 })} ${unit}`;
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
