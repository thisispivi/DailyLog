"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { Fragment, useState } from "react";
import { DayPicker } from "react-day-picker";
import { enGB, it } from "react-day-picker/locale";

import { hourCycle, translate } from "@/core/i18n/translate";
import { localInputValue, toTwelveHour, toTwentyFourHour } from "@/core/time/zoned-time";
import type { Locale, TimeFormat } from "@/features/logbook/domain";
import { usePortalContainer } from "@/ui/sheet";

import "react-day-picker/style.css";
import "./controls.css";

type Mode = "date" | "datetime";

const calendarLocales = { en: enGB, it } as const;

/**
 * A styled date or date-time picker. The value is the same wall-clock string a
 * native input would give (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`) and is submitted
 * through a hidden input, so forms read it exactly as before.
 */
export function DateTimeField({
    clearable = false,
    defaultValue = "",
    disabled = false,
    fallbackDate = "",
    id,
    label,
    labelHidden = false,
    locale,
    mode = "datetime",
    name,
    onChange,
    placeholder,
    timeFormat = "24h",
    timeZone,
    value: controlledValue,
    yearPicker = false,
}: Readonly<{
    clearable?: boolean;
    defaultValue?: string;
    disabled?: boolean;
    /**
     * The day (`YYYY-MM-DD`) the calendar opens on while the field is empty, and
     * the day a time typed on its own lands on. For a range end, pass the start
     * day, so logging yesterday doesn't jump the end back to today.
     */
    fallbackDate?: string;
    id: string;
    label: string;
    /** Keep the label for screen readers only, e.g. in a filter bar. */
    labelHidden?: boolean;
    locale: Locale;
    mode?: Mode;
    name?: string;
    onChange?: (value: string) => void;
    /** Shown while empty instead of "Not set", e.g. to tell a From field from a To field. */
    placeholder?: string;
    /** Only used in datetime mode. */
    timeFormat?: TimeFormat;
    timeZone: string;
    value?: string;
    /** A tappable caption that opens year and month grids, for dates far in the past. */
    yearPicker?: boolean;
}>) {
    const container = usePortalContainer();
    const [open, setOpen] = useState(false);
    const [internalValue, setInternalValue] = useState(defaultValue);
    const value = controlledValue ?? internalValue;
    const [date = "", time = ""] = value.split("T");

    function update(next: string) {
        setInternalValue(next);
        onChange?.(next);
    }

    function setDate(nextDate: string) {
        const fallbackTime = time || localInputValue(new Date(), timeZone).slice(11);
        update(mode === "date" ? nextDate : `${nextDate}T${fallbackTime}`);
        if (mode === "date") setOpen(false);
    }

    function setTime(nextTime: string) {
        if (!nextTime) return;
        const day = date || fallbackDate || localInputValue(new Date(), timeZone).slice(0, 10);
        update(`${day}T${nextTime}`);
    }

    return (
        <div className="field">
            <label className={labelHidden ? "sr-only" : undefined} htmlFor={id}>
                {label}
            </label>
            <div className="date-field">
                <Popover.Root onOpenChange={setOpen} open={open}>
                    <Popover.Trigger asChild disabled={disabled}>
                        <button className="select-trigger" id={id} type="button">
                            <CalendarDays aria-hidden="true" size={18} />
                            <span className={value ? undefined : "muted"}>
                                {value
                                    ? formatValue(value, mode, locale, timeFormat)
                                    : (placeholder ?? translate(locale, "common.notSet"))}
                            </span>
                        </button>
                    </Popover.Trigger>
                    <Popover.Portal container={container}>
                        <Popover.Content align="start" className="date-popover" sideOffset={6}>
                            <Calendar
                                hasYearPicker={yearPicker}
                                locale={locale}
                                onSelect={setDate}
                                selected={toCalendarDate(date || fallbackDate)}
                            />
                            {mode === "datetime" && (
                                <div className="time-row">
                                    <TimeInput
                                        locale={locale}
                                        onChange={setTime}
                                        time={time}
                                        twelveHour={timeFormat === "12h"}
                                    />
                                    <button
                                        className="button button-ghost"
                                        onClick={() =>
                                            update(localInputValue(new Date(), timeZone))
                                        }
                                        type="button"
                                    >
                                        {translate(locale, "common.now")}
                                    </button>
                                    <Popover.Close className="button button-primary">
                                        {translate(locale, "common.done")}
                                    </Popover.Close>
                                </div>
                            )}
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>
                {clearable && value && !disabled && (
                    <button
                        aria-label={translate(locale, "common.clear")}
                        className="icon-button date-clear"
                        onClick={() => update("")}
                        type="button"
                    >
                        <X aria-hidden="true" size={16} />
                    </button>
                )}
            </div>
            {name && <input disabled={disabled} name={name} type="hidden" value={value} />}
        </div>
    );
}

type TimeParts = { hour: string; minute: string; pm: boolean };

/**
 * Hour and minute as two numeric text fields, plus an AM/PM toggle on a
 * 12-hour clock. A native `type="time"` input inside the popover does not raise
 * the keyboard on some phones, while `inputMode="numeric"` always does. Partial
 * typing is kept as a draft until it is a valid time, and dropped when focus
 * leaves the group.
 */
function TimeInput({
    locale,
    onChange,
    time,
    twelveHour,
}: Readonly<{
    locale: Locale;
    onChange: (time: string) => void;
    time: string;
    twelveHour: boolean;
}>) {
    const [hour = "", minute = ""] = time.split(":");
    const [draft, setDraft] = useState<TimeParts | null>(null);
    const shown = draft ?? {
        hour: hour && twelveHour ? pad(toTwelveHour(Number(hour))) : hour,
        minute,
        pm: Number(hour) >= 12,
    };

    function commit(next: TimeParts) {
        setDraft(next);
        const [nextHour, nextMinute] = [Number(next.hour), Number(next.minute)];
        const validHour = twelveHour ? nextHour >= 1 && nextHour <= 12 : nextHour <= 23;
        if (!next.hour || !next.minute || !validHour || nextMinute > 59) return;
        const hours = twelveHour ? toTwentyFourHour(nextHour, next.pm) : nextHour;
        onChange(`${pad(hours)}:${pad(nextMinute)}`);
    }

    return (
        <div
            className="input time-input numeric"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDraft(null);
            }}
            role="group"
            aria-label={translate(locale, "entry.time")}
        >
            {(["hour", "minute"] as const).map((part, index) => (
                <Fragment key={part}>
                    {index > 0 && <span aria-hidden="true">:</span>}
                    <input
                        aria-label={translate(
                            locale,
                            part === "hour" ? "entry.hours" : "entry.minutes",
                        )}
                        autoComplete="off"
                        enterKeyHint="done"
                        inputMode="numeric"
                        maxLength={2}
                        onChange={(event) =>
                            commit({
                                ...shown,
                                [part]: event.currentTarget.value.replaceAll(/\D/g, "").slice(0, 2),
                            })
                        }
                        onFocus={(event) => event.currentTarget.select()}
                        pattern="[0-9]*"
                        placeholder="--"
                        type="text"
                        value={shown[part]}
                    />
                </Fragment>
            ))}
            {twelveHour && (
                <button
                    className="time-period"
                    onClick={() => commit({ ...shown, pm: !shown.pm })}
                    type="button"
                >
                    {translate(locale, shown.pm ? "entry.pm" : "entry.am")}
                </button>
            )}
        </div>
    );
}

const pad = (number: number) => String(number).padStart(2, "0");

type CalendarView = "days" | "months" | "years";

const FIRST_YEAR = 1900;

/**
 * The day grid. With `hasYearPicker`, the caption is a button that opens a year
 * grid and then a month grid, as on Android, instead of paging month by month.
 * It mounts with the popover, so every opening starts on the selected month.
 */
function Calendar({
    hasYearPicker,
    locale,
    onSelect,
    selected,
}: Readonly<{
    hasYearPicker: boolean;
    locale: Locale;
    onSelect: (date: string) => void;
    selected: Date | undefined;
}>) {
    const [month, setMonth] = useState(selected ?? new Date());
    const [view, setView] = useState<CalendarView>("days");
    const today = new Date();
    const caption = (
        <button
            aria-expanded={view !== "days"}
            className="date-caption-button"
            onClick={() => setView(view === "days" ? "years" : "days")}
            type="button"
        >
            {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month)}
            <ChevronDown aria-hidden="true" size={16} />
        </button>
    );

    if (view === "years") {
        const years = Array.from(
            { length: today.getFullYear() - FIRST_YEAR + 1 },
            (_, index) => FIRST_YEAR + index,
        );
        return (
            <div className="date-grid-view">
                {caption}
                <div className="date-grid date-years">
                    {years.map((year) => (
                        <button
                            aria-pressed={year === month.getFullYear()}
                            className="date-grid-option numeric"
                            key={year}
                            onClick={() => {
                                setMonth(new Date(year, month.getMonth(), 1));
                                setView("months");
                            }}
                            // Open the grid scrolled to the shown year.
                            ref={(node) => {
                                if (node && year === month.getFullYear()) {
                                    node.scrollIntoView({ block: "center" });
                                }
                            }}
                            type="button"
                        >
                            {year}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (view === "months") {
        const monthName = new Intl.DateTimeFormat(locale, { month: "short" });
        return (
            <div className="date-grid-view">
                {caption}
                <div className="date-grid date-months">
                    {Array.from({ length: 12 }, (_, index) => (
                        <button
                            aria-pressed={index === month.getMonth()}
                            className="date-grid-option"
                            key={index}
                            onClick={() => {
                                setMonth(new Date(month.getFullYear(), index, 1));
                                setView("days");
                            }}
                            type="button"
                        >
                            {monthName.format(new Date(2000, index, 1))}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <DayPicker
            {...(hasYearPicker
                ? { components: { CaptionLabel: () => caption }, endMonth: today }
                : {})}
            locale={calendarLocales[locale]}
            mode="single"
            month={month}
            onMonthChange={setMonth}
            onSelect={(date) => date && onSelect(fromCalendarDate(date))}
            selected={selected}
            weekStartsOn={1}
        />
    );
}

// The calendar works with browser-local Date objects; these only carry the
// calendar day, never a moment in time, so the browser's own zone is harmless.
function toCalendarDate(date: string): Date | undefined {
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day);
}

function fromCalendarDate(value: Date): string {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatValue(value: string, mode: Mode, locale: Locale, timeFormat: TimeFormat): string {
    const [date = "", time = "00:00"] = value.split("T");
    const calendar = toCalendarDate(date);
    if (!calendar) return value;
    const [hour = 0, minute = 0] = time.split(":").map(Number);
    calendar.setHours(hour, minute);
    return new Intl.DateTimeFormat(
        locale,
        mode === "date"
            ? { dateStyle: "medium" }
            : {
                  // timeStyle ignores hourCycle, so the fields are spelled out.
                  day: "numeric",
                  hour: "2-digit",
                  hourCycle: hourCycle(timeFormat),
                  minute: "2-digit",
                  month: "short",
                  year: "numeric",
              },
    ).format(calendar);
}
