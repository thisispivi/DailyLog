const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Converts a local calendar date and clock in an IANA timezone to an unambiguous UTC ISO timestamp. */
export function localDateTimeToUtc(date: string, time: string, timeZone: string): string {
    if (!datePattern.test(date) || !/^\d{2}:\d{2}$/.test(time))
        throw new Error("Invalid local date or time.");
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    const [hour, minute] = time.split(":").map(Number) as [number, number];
    if (hour > 23 || minute > 59) throw new Error("Invalid local time.");
    const localEpoch = Date.UTC(year, month - 1, day, hour, minute);
    let utcEpoch = localEpoch;
    for (let pass = 0; pass < 3; pass += 1) {
        utcEpoch = localEpoch - timezoneOffsetMilliseconds(new Date(utcEpoch), timeZone);
    }
    return new Date(utcEpoch).toISOString();
}

/** Converts a `datetime-local` input value (YYYY-MM-DDTHH:mm) to a UTC ISO timestamp. */
export function localInputToUtc(value: string, timeZone: string): string {
    const [date = "", time = ""] = value.split("T");
    return localDateTimeToUtc(date, time, timeZone);
}

/** Returns UTC bounds for one inclusive local-date filter. */
export function localDateRangeBounds(from: string, to: string, timeZone: string): [string, string] {
    if (!datePattern.test(from) || !datePattern.test(to)) throw new Error("Invalid date range.");
    const start = localDateTimeToUtc(from, "00:00", timeZone);
    const end = localDateTimeToUtc(shiftDate(to, 1), "00:00", timeZone);
    return [toStorageTimestamp(start), toStorageTimestamp(end)];
}

/** Normalizes any ISO timestamp to the `+00:00` form stored since the Telegram bot. */
export function toStorageTimestamp(isoTimestamp: string): string {
    return new Date(isoTimestamp).toISOString().replace("Z", "+00:00");
}

/** Adds whole days to a YYYY-MM-DD calendar date. */
export function shiftDate(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

/** The `count` calendar dates ending with `lastDate`, oldest first. */
export function datesEndingOn(lastDate: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) => shiftDate(lastDate, index - count + 1));
}

/** The local hour (0-23) of a moment in a timezone. */
export function localHour(value: Date, timeZone: string): number {
    return Number(
        new Intl.DateTimeFormat("en", { hour: "2-digit", hourCycle: "h23", timeZone }).format(
            value,
        ),
    );
}

export function localDateInZone(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
    }).format(value);
}

/** A 12-hour clock hour (1–12) and AM/PM as a 24-hour hour (0–23). */
export function toTwentyFourHour(hour: number, pm: boolean): number {
    return (hour % 12) + (pm ? 12 : 0);
}

/** A 24-hour hour (0–23) on a 12-hour clock: midnight and noon are 12. */
export function toTwelveHour(hour: number): number {
    return hour % 12 || 12;
}

export function localInputValue(value: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
    }).formatToParts(value);
    const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

function timezoneOffsetMilliseconds(value: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        timeZone,
        year: "numeric",
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second),
    );
    return renderedAsUtc - value.getTime();
}
