"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, X } from "lucide-react";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { enGB, it } from "react-day-picker/locale";

import { translate } from "@/core/i18n/translate";
import { localInputValue } from "@/core/time/zoned-time";
import type { Locale } from "@/features/logbook/domain";
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
    id,
    label,
    labelHidden = false,
    locale,
    mode = "datetime",
    name,
    onChange,
    timeZone,
    value: controlledValue,
}: Readonly<{
    clearable?: boolean;
    defaultValue?: string;
    disabled?: boolean;
    id: string;
    label: string;
    /** Keep the label for screen readers only, e.g. in a filter bar. */
    labelHidden?: boolean;
    locale: Locale;
    mode?: Mode;
    name?: string;
    onChange?: (value: string) => void;
    timeZone: string;
    value?: string;
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
        const day = date || localInputValue(new Date(), timeZone).slice(0, 10);
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
                                    ? formatValue(value, mode, locale)
                                    : translate(locale, "common.notSet")}
                            </span>
                        </button>
                    </Popover.Trigger>
                    <Popover.Portal container={container}>
                        <Popover.Content align="start" className="date-popover" sideOffset={6}>
                            <DayPicker
                                defaultMonth={toCalendarDate(date) ?? new Date()}
                                locale={calendarLocales[locale]}
                                mode="single"
                                onSelect={(selected) =>
                                    selected && setDate(fromCalendarDate(selected))
                                }
                                selected={toCalendarDate(date)}
                                weekStartsOn={1}
                            />
                            {mode === "datetime" && (
                                <div className="time-row">
                                    <input
                                        aria-label={translate(locale, "entry.time")}
                                        className="input time-input numeric"
                                        onChange={(event) => setTime(event.currentTarget.value)}
                                        type="time"
                                        value={time}
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

// The calendar works with browser-local Date objects; these only carry the
// calendar day, never a moment in time, so the browser's own zone is harmless.
function toCalendarDate(date: string): Date | undefined {
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day);
}

function fromCalendarDate(value: Date): string {
    const pad = (number: number) => String(number).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatValue(value: string, mode: Mode, locale: Locale): string {
    const [date = "", time = "00:00"] = value.split("T");
    const calendar = toCalendarDate(date);
    if (!calendar) return value;
    const [hour = 0, minute = 0] = time.split(":").map(Number);
    calendar.setHours(hour, minute);
    return new Intl.DateTimeFormat(
        locale,
        mode === "date" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" },
    ).format(calendar);
}
